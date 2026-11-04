import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { checkout, payOrder, advanceOrder, getOrder, runOrderJobs } from "../../src/lib/orders";
import { rewardBalance } from "../../src/lib/rewards";
import type { AuthUser } from "../../src/lib/auth";

let kitchen: AuthUser;
const input = () => ({
  checkoutKey: randomUUID(), outletId: "kondapur",
  lines: [{ itemId: "chicken-biryani", quantity: 2, portion: "regular" as const, addOnIds: [] }],
  fulfillment: "pickup" as const, address: "", phone: "9000000000", note: "Rewards verification",
});
const payment = (outcome: "success" | "failed" | "pending" = "success") => ({ attemptKey: randomUUID(), method: "UPI" as const, outcome });
async function customer(points = 0) {
  const user = await db.user.create({ data: {
    email: `reward-${randomUUID()}@deccan.example`, name: "Rewards test customer", passwordHash: "test-only", role: "CUSTOMER",
  }, include: { outlet: true } });
  if (points) await db.loyaltyEntry.create({ data: { userId: user.id, kind: "OPENING", points } });
  return user;
}
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  kitchen = await db.user.findUniqueOrThrow({ where: { id: "demo-kitchen-kondapur" }, include: { outlet: true } });
});
afterAll(() => db.$disconnect());

describe.sequential("transactional coupons and loyalty", () => {
  it("reserves a welcome coupon once across concurrent checkouts and deduplicates retries", async () => {
    const user = await customer();
    const data = { ...input(), couponCode: "WELCOME100" };
    const [one, retry] = await Promise.all([checkout(data, user), checkout(data, user)]);
    expect(one.id).toBe(retry.id);
    expect(one.totalPaise).toBe(54000);
    const results = await Promise.allSettled([
      checkout({ ...input(), couponCode: "WELCOME100" }, user),
      checkout({ ...input(), outletId: "kukatpally", couponCode: "WELCOME100" }, user),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    await payOrder(one.id, payment(), user);
    await expect(checkout({ ...input(), couponCode: "WELCOME100" }, user)).rejects.toThrow("first paid");
  });
  it("prevents cross-outlet double spending and releases holds exactly once on expiry", async () => {
    const user = await customer(100);
    const results = await Promise.allSettled([
      checkout({ ...input(), redeemedPoints: 80 }, user),
      checkout({ ...input(), outletId: "kukatpally", redeemedPoints: 80 }, user),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await rewardBalance(db, user.id)).toBe(20);
    const order = results.find((result) => result.status === "fulfilled")!;
    if (order.status !== "fulfilled") throw new Error("No checkout");
    await db.order.update({ where: { id: order.value.id }, data: { expiresAt: new Date(0) } });
    await Promise.all([runOrderJobs(), runOrderJobs()]);
    expect(await rewardBalance(db, user.id)).toBe(100);
    expect(await db.loyaltyEntry.count({ where: { orderId: order.value.id, kind: "RELEASE" } })).toBe(1);
  });
  it("retains points through failed retries and earns only after handoff", async () => {
    const user = await customer(100);
    const order = await checkout({ ...input(), couponCode: "BIRYANI10", redeemedPoints: 80 }, user);
    expect(order.totalPaise).toBe(49600);
    await payOrder(order.id, payment("failed"), user);
    expect(await rewardBalance(db, user.id)).toBe(20);
    const paid = await payOrder(order.id, payment(), user);
    expect(await db.loyaltyEntry.count({ where: { orderId: order.id, kind: "EARN" } })).toBe(0);
    const preparing = await advanceOrder(order.id, "PREPARING", paid.version, kitchen);
    const ready = await advanceOrder(order.id, "READY", preparing.version, kitchen);
    await Promise.allSettled([
      advanceOrder(order.id, "HANDED_OFF", ready.version, kitchen),
      advanceOrder(order.id, "HANDED_OFF", ready.version, kitchen),
    ]);
    expect(await rewardBalance(db, user.id)).toBe(24);
    expect(await db.loyaltyEntry.count({ where: { orderId: order.id, kind: "EARN" } })).toBe(1);
  });
  it("returns redeemed points when a paid order is cancelled", async () => {
    const user = await customer(100);
    const order = await checkout({ ...input(), redeemedPoints: 50 }, user);
    const paid = await payOrder(order.id, payment(), user);
    await advanceOrder(order.id, "CANCELLED", paid.version, user);
    expect(await rewardBalance(db, user.id)).toBe(100);
  });
  it("refunds an ineligible reserved welcome order if another order was paid first", async () => {
    const user = await customer(100);
    const welcome = await checkout({ ...input(), couponCode: "WELCOME100", redeemedPoints: 50 }, user);
    const other = await checkout(input(), user);
    await payOrder(other.id, payment(), user);
    await payOrder(welcome.id, payment(), user);
    expect((await getOrder(welcome.id, user)).paymentStatus).toBe("REFUNDED");
    expect(await rewardBalance(db, user.id)).toBe(100);
  });
  it("returns points after a stock change refunds a delayed payment", async () => {
    const user = await customer(100);
    const order = await checkout({ ...input(), redeemedPoints: 50 }, user);
    await payOrder(order.id, payment("pending"), user);
    await db.availability.update({ where: { outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" } }, data: { available: false } });
    try {
      await db.payment.updateMany({ where: { orderId: order.id }, data: { resolveAt: new Date(0) } });
      await runOrderJobs();
      expect((await getOrder(order.id, user)).paymentStatus).toBe("REFUNDED");
      expect(await rewardBalance(db, user.id)).toBe(100);
    } finally {
      await db.availability.update({ where: { outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" } }, data: { available: true } });
    }
  });
});
