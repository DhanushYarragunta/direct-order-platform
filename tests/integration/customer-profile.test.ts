import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const cookieJar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
import { db } from "../../src/lib/db";
import { createSession, type AuthUser } from "../../src/lib/auth";
import {
  createSavedAddress, customerAddresses, customerProfile, deleteSavedAddress, updateCustomerProfile, updateSavedAddress,
} from "../../src/lib/customer-profile";
import { deleteAccount, exportAccount } from "../../src/lib/privacy";
import { GET as getProfile, PATCH as patchProfile } from "../../src/app/api/account/profile/route";
import { GET as getAddresses, POST as postAddress } from "../../src/app/api/account/addresses/route";
import { PATCH as patchAddress, DELETE as removeAddress } from "../../src/app/api/account/addresses/[id]/route";
import type { SavedAddressInput } from "../../src/lib/profile-validation";

const origin = "http://127.0.0.1:3001";
const phone = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const customer = (extra: { phone?: string; phoneVerifiedAt?: Date; role?: "CUSTOMER" | "ADMIN" } = {}) => db.user.create({ data: {
  name: "Profile customer", email: `profile-${randomUUID()}@customer.test`, passwordHash: "profile-test-password-hash",
  emailVerifiedAt: new Date(), ...extra,
}, include: { outlet: true } });
const address = (extra: Partial<SavedAddressInput> = {}): SavedAddressInput => ({
  label: "Home", recipientName: "Asha Rao", phone: "9876543210", addressLine: "Flat 12, Garden apartments",
  area: "Kondapur", city: "Hyderabad", pincode: "500084", latitude: 17.462, longitude: 78.357, isDefault: false, ...extra,
});
const request = (path: string, data: unknown, method = "PATCH", requestOrigin = origin) => new Request(origin + path, {
  method, headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(data),
});
const context = (id: string) => ({ params: Promise.resolve({ id }) });
async function signIn(user: { id: string; passwordHash: string }) {
  await createSession(user.id, user.passwordHash);
  const token = cookieJar.set.mock.calls.at(-1)![1];
  cookieJar.get.mockReturnValue({ value: token });
}

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
beforeEach(() => { vi.stubEnv("APP_ORIGIN", origin); cookieJar.get.mockReturnValue(undefined); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
afterAll(() => db.$disconnect());

describe.sequential("customer profile and saved address book", () => {
  it("reads only the signed-in profile and its addresses without authentication internals", async () => {
    const one = await customer(), other = await customer();
    const saved = await createSavedAddress(one.id, address());
    await createSavedAddress(other.id, address({ addressLine: "Foreign private building" }));
    await signIn(one);
    const response = await getProfile();
    expect(response.status).toBe(200);
    const profile = await response.json();
    expect(Object.keys(profile).sort()).toEqual(["addresses", "createdAt", "email", "emailVerifiedAt", "id", "name", "phone", "phoneVerifiedAt", "role"]);
    expect(profile.addresses.map((item: { id: string }) => item.id)).toEqual([saved.id]);
    expect(JSON.stringify(profile)).not.toContain(other.email);
    expect(JSON.stringify(profile)).not.toContain("password");
    expect(profile.addresses[0]).not.toHaveProperty("userId");
    expect((await (await getAddresses()).json()).addresses).toEqual(profile.addresses);
  });

  it("normalizes profile phone edits, clears verification and invalidates old phone challenges", async () => {
    const oldPhone = phone(), newPhone = phone(), account = await customer({ phone: oldPhone, phoneVerifiedAt: new Date() });
    await signIn(account);
    const otp = await db.phoneOtp.create({ data: { id: randomUUID(), userId: account.id, purpose: "verify_contact", phone: oldPhone,
      name: account.name, consentAt: new Date(), codeHash: "private-code", expiresAt: new Date(Date.now() + 300000) } });
    const reset = await db.passwordReset.create({ data: { id: randomUUID(), userId: account.id, channel: "sms",
      contactHash: createHash("sha256").update(oldPhone).digest("hex"), provider: "aws", codeHash: "private-reset-code", expiresAt: new Date(Date.now() + 300000) } });
    const response = await patchProfile(request("/api/account/profile", { name: " Asha Rao ", phone: `+91 ${newPhone}` }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: "Asha Rao", phone: newPhone, phoneVerifiedAt: null, email: account.email,
      emailVerifiedAt: account.emailVerifiedAt!.toISOString() });
    expect(await db.phoneOtp.findUnique({ where: { id: otp.id } })).toBeNull();
    expect(await db.passwordReset.findUnique({ where: { id: reset.id } })).toBeNull();
    expect(await db.session.count({ where: { userId: account.id } })).toBe(1);
    expect(await db.audit.findFirst({ where: { actorId: account.id, action: "PROFILE_UPDATED" } })).toMatchObject({
      detail: expect.not.stringContaining(newPhone),
    });
    expect((await updateCustomerProfile(account.id, { name: "Asha Rao", phone: null })).phone).toBeNull();
  });

  it("preserves verification when the normalized phone did not change", async () => {
    const account = await customer({ phone: phone(), phoneVerifiedAt: new Date() });
    const updated = await updateCustomerProfile(account.id, { name: "New display name", phone: `+91 ${account.phone}` });
    expect(updated.phoneVerifiedAt).toEqual(account.phoneVerifiedAt);
  });

  it("never reassigns another account’s phone, including concurrent claims", async () => {
    const one = await customer({ phone: phone() }), other = await customer({ phone: phone() });
    await signIn(one);
    const duplicate = await patchProfile(request("/api/account/profile", { name: one.name, phone: `+91 ${other.phone}` }));
    expect(duplicate.status).toBe(409);
    expect((await db.user.findUniqueOrThrow({ where: { id: one.id } })).phone).toBe(one.phone);
    const available = phone();
    const results = await Promise.allSettled([
      updateCustomerProfile(one.id, { name: one.name, phone: available }),
      updateCustomerProfile(other.id, { name: other.name, phone: available }),
    ]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { phone: available } })).toBe(1);
  });

  it("keeps one default through creation, full edits, switching and deletion", async () => {
    const account = await customer();
    const home = await createSavedAddress(account.id, address()), work = await createSavedAddress(account.id, address({ label: "Work" }));
    expect(home.isDefault).toBe(true); expect(work.isDefault).toBe(false);
    await updateSavedAddress(account.id, work.id, { isDefault: true });
    const edited = await updateSavedAddress(account.id, work.id, address({ label: "Work", addressLine: "Floor 3, Office building", isDefault: false }));
    expect(edited.isDefault).toBe(true);
    expect((await customerAddresses(account.id)).addresses[0].id).toBe(work.id);
    await deleteSavedAddress(account.id, work.id);
    expect((await customerAddresses(account.id)).addresses).toMatchObject([{ id: home.id, isDefault: true }]);
    await deleteSavedAddress(account.id, home.id);
    expect((await customerAddresses(account.id)).addresses).toEqual([]);
  });

  it("persists area-level search precision and derives curated locality precision", async () => {
    const account = await customer();
    const area = await createSavedAddress(account.id, address({ locationKind: "area", localityId: null }));
    const curated = await createSavedAddress(account.id, address({ locationKind: "place", localityId: "kondapur", latitude: 0, longitude: 0 }));
    const stored = (await customerProfile(account.id)).addresses;
    expect(stored.find(item => item.id === area.id)).toMatchObject({ locationKind: "area", localityId: null });
    expect(stored.find(item => item.id === curated.id)).toMatchObject({ locationKind: "area", localityId: "kondapur", latitude: 17.462, longitude: 78.357 });
    await updateSavedAddress(account.id, area.id, address({ locationKind: "place", latitude: 17.463, longitude: 78.358 }));
    expect((await customerAddresses(account.id)).addresses.find(item => item.id === area.id)).toMatchObject({ locationKind: "place", localityId: null });
  });

  it("serializes concurrent default creates without losing a submitted address", async () => {
    const account = await customer();
    const created = await Promise.all([
      createSavedAddress(account.id, address({ label: "Home", isDefault: true })),
      createSavedAddress(account.id, address({ label: "Work", isDefault: true })),
      createSavedAddress(account.id, address({ label: "Other", isDefault: true })),
    ]);
    expect(created).toHaveLength(3);
    const stored = (await customerAddresses(account.id)).addresses;
    expect(stored).toHaveLength(3);
    expect(stored.filter(item => item.isDefault)).toHaveLength(1);
  });

  it("preserves the default invariant when selection races with deleting the previous default", async () => {
    const account = await customer();
    const home = await createSavedAddress(account.id, address()), work = await createSavedAddress(account.id, address({ label: "Work" }));
    await Promise.all([updateSavedAddress(account.id, work.id, { isDefault: true }), deleteSavedAddress(account.id, home.id)]);
    expect((await customerAddresses(account.id)).addresses).toMatchObject([{ id: work.id, isDefault: true }]);
  });

  it("enforces the ten-address limit under concurrent requests", async () => {
    const account = await customer();
    for (let i = 0; i < 9; i++) await createSavedAddress(account.id, address({ addressLine: `Building number ${i}` }));
    const results = await Promise.allSettled([createSavedAddress(account.id, address()), createSavedAddress(account.id, address())]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(item => item.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toMatchObject({ status: 409 });
    expect((await customerAddresses(account.id)).addresses).toHaveLength(10);
  });

  it("scopes edits and deletes to the authenticated owner", async () => {
    const one = await customer(), other = await customer();
    const foreign = await createSavedAddress(other.id, address());
    await signIn(one);
    expect((await patchAddress(request(`/api/account/addresses/${foreign.id}`, { isDefault: true }), context(foreign.id))).status).toBe(404);
    expect((await removeAddress(request(`/api/account/addresses/${foreign.id}`, {}, "DELETE"), context(foreign.id))).status).toBe(404);
    expect(await db.savedAddress.findUnique({ where: { id: foreign.id } })).toMatchObject({ userId: other.id, isDefault: true });
    const created = await postAddress(request("/api/account/addresses", address({ phone: "9123456789" }), "POST"));
    expect(created.status).toBe(201);
    const saved = await created.json();
    expect((await patchAddress(request(`/api/account/addresses/${saved.id}`, address({ addressLine: "Floor 4, Updated building" })), context(saved.id))).status).toBe(200);
    expect((await removeAddress(request(`/api/account/addresses/${saved.id}`, {}, "DELETE"), context(saved.id))).status).toBe(200);
    expect((await customerProfile(one.id)).phone).toBeNull();
  });

  it("rejects anonymous, staff, foreign-origin and privilege-injection mutations", async () => {
    expect((await getProfile()).status).toBe(401);
    expect((await postAddress(request("/api/account/addresses", address(), "POST"))).status).toBe(401);
    const account = await customer(); await signIn(account);
    expect((await patchProfile(request("/api/account/profile", { name: account.name, phone: null, role: "ADMIN" }))).status).toBe(400);
    expect((await postAddress(request("/api/account/addresses", { ...address(), userId: "other" }, "POST"))).status).toBe(400);
    expect((await patchProfile(request("/api/account/profile", { name: account.name, phone: null }, "PATCH", "https://untrusted.example"))).status).toBe(403);
    expect((await postAddress(request("/api/account/addresses", address(), "POST", "https://untrusted.example"))).status).toBe(403);
    const saved = await createSavedAddress(account.id, address());
    expect((await removeAddress(request(`/api/account/addresses/${saved.id}`, {}, "DELETE", "https://untrusted.example"), context(saved.id))).status).toBe(403);
    const staff = await customer({ role: "ADMIN" }); await signIn(staff);
    expect((await getProfile()).status).toBe(200);
    expect((await patchProfile(request("/api/account/profile", { name: staff.name, phone: null }))).status).toBe(403);
    expect((await postAddress(request("/api/account/addresses", address(), "POST"))).status).toBe(403);
    await expect(createSavedAddress(staff.id, address())).rejects.toMatchObject({ status: 403 });
  });

  it("exports saved contacts only for the owner and removes them during account erasure", async () => {
    const one = await customer(), other = await customer();
    const saved = await createSavedAddress(one.id, address()), foreign = await createSavedAddress(other.id, address({ addressLine: "Foreign home address" }));
    const exported = await exportAccount(one.id);
    expect(exported.addresses).toMatchObject([{ id: saved.id, phone: saved.phone }]);
    expect(JSON.stringify(exported)).not.toContain(foreign.id);
    await deleteAccount(one as AuthUser);
    expect(await db.savedAddress.count({ where: { userId: one.id } })).toBe(0);
    expect(await db.savedAddress.count({ where: { userId: other.id } })).toBe(1);
    await expect(createSavedAddress(one.id, address())).rejects.toMatchObject({ status: 401 });
    await expect(updateCustomerProfile(one.id, { name: "New name", phone: null })).rejects.toMatchObject({ status: 401 });
    await expect(customerProfile(one.id)).rejects.toMatchObject({ status: 401 });
  });

  it("cannot leave an address behind when saving races with account erasure", async () => {
    const account = await customer();
    const results = await Promise.allSettled([createSavedAddress(account.id, address()), deleteAccount(account as AuthUser)]);
    expect(results[1].status).toBe("fulfilled");
    expect(await db.savedAddress.count({ where: { userId: account.id } })).toBe(0);
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).deletedAt).not.toBeNull();
  });
});
