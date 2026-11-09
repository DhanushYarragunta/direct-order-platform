import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
const cookieJar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
import { db } from "../../src/lib/db";
import { createSession, type AuthUser } from "../../src/lib/auth";
import { customerProfile, setFavorite } from "../../src/lib/customer-profile";
import { deleteAccount, exportAccount } from "../../src/lib/privacy";
import { listCoupons, saveCoupon } from "../../src/lib/coupons";
import { checkout, payOrder, getOrder } from "../../src/lib/orders";
import { PUT as favorite } from "../../src/app/api/account/favorites/route";
import { POST as createCoupon, GET as coupons } from "../../src/app/api/admin/coupons/route";
import type { CouponInput } from "../../src/lib/coupon-validation";

let admin: AuthUser & { passwordHash: string };
const origin = "http://127.0.0.1:3001";
const customer = () => db.user.create({ data: { email: `completion-${randomUUID()}@deccan.example`, name: "Completion customer", passwordHash: "test-only" }, include: { outlet: true } });
const offer = (): CouponInput => ({ code: `NEW${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`, description: "First meal discount", type: "FIXED", value: 10000,
  minSubtotalPaise: 10000, maxDiscountPaise: 10000, active: true, firstOrderOnly: true, startsAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() });
const input = (code: string) => ({ checkoutKey: randomUUID(), outletId: "kondapur", fulfillment: "pickup" as const, address: "", phone: "9000000000", note: "", couponCode: code,
  lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular" as const, addOnIds: [] }] });
const request = (path: string, data: unknown, method: string, requestOrigin = origin) => new Request(origin + path, { method, headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(data) });
async function signIn(user: { id: string; passwordHash: string }) {
  await createSession(user.id, user.passwordHash);
  cookieJar.get.mockReturnValue({ value: cookieJar.set.mock.calls.at(-1)![1] });
}
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  admin = await db.user.findUniqueOrThrow({ where: { id: "demo-admin" }, include: { outlet: true } });
});
afterEach(() => { vi.clearAllMocks(); cookieJar.get.mockReturnValue(undefined); });
afterAll(() => db.$disconnect());

describe.sequential("favourites and coupon management", () => {
  it("persists favourites once, isolates accounts and exports and erases them", async () => {
    const one = await customer(), other = await customer();
    await Promise.all([setFavorite(one.id, "chicken-biryani", true), setFavorite(one.id, "chicken-biryani", true)]);
    expect((await customerProfile(one.id)).favorites).toEqual([{ itemId: "chicken-biryani" }]);
    expect((await customerProfile(other.id)).favorites).toEqual([]);
    expect((await exportAccount(one.id)).favorites).toHaveLength(1);
    await setFavorite(one.id, "chicken-biryani", false);
    expect((await customerProfile(one.id)).favorites).toHaveLength(0);
    await Promise.allSettled([setFavorite(one.id, "chicken-biryani", true), deleteAccount(one)]);
    expect(await db.favorite.count({ where: { userId: one.id } })).toBe(0);
    await expect(setFavorite(one.id, "chicken-biryani", true)).rejects.toMatchObject({ status: 401 });
  });
  it("protects favourite and coupon routes against wrong roles, forged owners and foreign origins", async () => {
    const args = { itemId: "chicken-biryani", saved: true };
    expect((await favorite(request("/api/account/favorites", args, "PUT"))).status).toBe(401);
    expect((await coupons()).status).toBe(401);
    const one = await customer(); await signIn(one);
    expect((await favorite(request("/api/account/favorites", { ...args, userId: "other" }, "PUT"))).status).toBe(400);
    expect((await favorite(request("/api/account/favorites", args, "PUT", "https://foreign.example"))).status).toBe(403);
    expect((await favorite(request("/api/account/favorites", args, "PUT"))).status).toBe(200);
    expect((await createCoupon(request("/api/admin/coupons", offer(), "POST"))).status).toBe(403);
    await expect(listCoupons(one)).rejects.toMatchObject({ status: 403 });
    await signIn(admin);
    expect((await favorite(request("/api/account/favorites", args, "PUT"))).status).toBe(403);
    expect((await createCoupon(request("/api/admin/coupons", offer(), "POST", "https://foreign.example"))).status).toBe(403);
    expect((await createCoupon(request("/api/admin/coupons", offer(), "POST"))).status).toBe(201);
  });
  it("prevents two different first-order coupons being reserved concurrently", async () => {
    const one = await customer(), a = await saveCoupon(admin, offer()), b = await saveCoupon(admin, offer());
    const results = await Promise.allSettled([checkout(input(a.code), one), checkout(input(b.code), one)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
  it("preserves pending checkout amounts and first-order rules when the coupon is edited", async () => {
    const one = await customer(), original = offer(), saved = await saveCoupon(admin, original);
    const reserved = await checkout(input(saved.code), one);
    expect(reserved.couponFirstOrderOnly).toBe(true);
    await saveCoupon(admin, { ...original, firstOrderOnly: false, value: 20000, active: false }, saved.version);
    await expect(checkout(input(saved.code), await customer())).rejects.toThrow(/not currently available/);
    const other = await checkout({ ...input(saved.code), couponCode: undefined }, one);
    await payOrder(other.id, { attemptKey: randomUUID(), method: "UPI", outcome: "success" }, one);
    await payOrder(reserved.id, { attemptKey: randomUUID(), method: "UPI", outcome: "success" }, one);
    expect((await getOrder(reserved.id, one)).paymentStatus).toBe("REFUNDED");
    expect((await getOrder(reserved.id, one)).totalPaise).toBe(reserved.totalPaise);
  });
  it("rejects stale coupon edits and records who changed the offer", async () => {
    const original = offer(), saved = await saveCoupon(admin, original);
    const results = await Promise.allSettled([saveCoupon(admin, { ...original, active: false }, saved.version), saveCoupon(admin, { ...original, description: "Another offer description" }, saved.version)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await db.audit.count({ where: { actorId: admin.id, action: "COUPON_UPDATED", detail: { startsWith: `${saved.code}:` } } })).toBe(1);
  });
});
