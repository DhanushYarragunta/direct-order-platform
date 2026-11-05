import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { deleteAccount, exportAccount, updateMarketing } from "../../src/lib/privacy";
import { requestPhoneOtp, verifyPhoneOtp } from "../../src/lib/phone-otp";
import type { AuthUser } from "../../src/lib/auth";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
afterAll(() => db.$disconnect());

async function customer() {
  return db.user.create({ data: { email: `privacy-${randomUUID()}@example.test`, name: "Privacy customer",
    passwordHash: "private-password-hash", phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
    marketingOptIn: true, consentAt: new Date(),
  }, include: { outlet: true } });
}
const otpInput = () => ({ phone: `8${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`,
  name: "Phone customer", consent: true as const, marketingOptIn: false });

describe.sequential("privacy and phone verification", () => {
  it("exports only the signed-in customer's data and records consent withdrawal", async () => {
    const one = await customer(), other = await customer();
    await updateMarketing(one.id, false);
    const payload = await exportAccount(one.id);
    expect(payload.profile.id).toBe(one.id);
    expect(payload.profile.marketingOptIn).toBe(false);
    expect(payload.consentHistory).toEqual(expect.arrayContaining([expect.objectContaining({ action: "MARKETING_WITHDRAWN" })]));
    expect(JSON.stringify(payload)).not.toContain("private-password-hash");
    expect(JSON.stringify(payload)).not.toContain(other.email);
    expect(await db.user.findUnique({ where: { id: other.id } })).toMatchObject({ marketingOptIn: true });
  });

  it("blocks deletion during fulfilment, then removes contacts and sessions while retaining accounting", async () => {
    const user = await customer();
    await db.session.create({ data: { id: randomUUID(), userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
    const order = await db.order.create({ data: {
      number: `PRIVACY-${randomUUID()}`, userId: user.id, outletId: "kondapur", checkoutKey: randomUUID(), cartHash: "hash",
      status: "OUT_FOR_DELIVERY", paymentStatus: "PAID", fulfillment: "delivery", address: "123 private street", phone: user.phone!, note: "Private instructions",
      totalPaise: 32000, subtotalPaise: 32000, gstPaise: 1524, workMinutes: 12, expiresAt: new Date(),
    } });
    await expect(deleteAccount(user)).rejects.toThrow("Complete or cancel active orders");
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    await db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });
    await db.message.create({ data: { orderId: order.id, kind: "PRIVATE", body: "Contact me at 123 private street" } });
    await db.audit.create({ data: { actorId: user.id, orderId: order.id, action: "ORDER_NOTE", detail: "Private instructions" } });
    await deleteAccount(user);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.name).toBe("Deleted customer");
    expect(stored.phone).toBeNull();
    expect(stored.email).not.toBe(user.email);
    expect(stored.passwordHash).toBe("disabled");
    expect(stored.marketingOptIn).toBe(false);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.message.count({ where: { orderId: order.id } })).toBe(0);
    const retained = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(retained).toMatchObject({ status: "DELIVERED", totalPaise: 32000, phone: "", address: "", note: "", cartHash: "redacted" });
    await expect(updateMarketing(user.id, true)).rejects.toThrow("no longer available");
  });

  it("rejects customer deletion tools for staff accounts", async () => {
    const staff = await db.user.findUniqueOrThrow({ where: { id: "demo-admin" }, include: { outlet: true } });
    await expect(deleteAccount(staff as AuthUser)).rejects.toThrow("Staff accounts");
    await expect(deleteAccount({ ...staff, role: "CUSTOMER" } as AuthUser)).rejects.toThrow("Staff accounts");
  });

  it("uses a one-time hashed phone code and permits only one concurrent redemption", async () => {
    const input = otpInput();
    const challenge = await requestPhoneOtp(input);
    const stored = await db.phoneOtp.findUniqueOrThrow({ where: { id: challenge.challengeId } });
    expect(stored.codeHash).not.toBe(challenge.demoCode);
    expect(stored.codeHash.length).toBeGreaterThan(128);
    const results = await Promise.allSettled([
      verifyPhoneOtp({ challengeId: challenge.challengeId, code: challenge.demoCode }),
      verifyPhoneOtp({ challengeId: challenge.challengeId, code: challenge.demoCode }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.user.count({ where: { phone: input.phone } })).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { phone: input.phone } });
    expect(user).toMatchObject({ role: "CUSTOMER", marketingOptIn: false });
    await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code: challenge.demoCode })).rejects.toThrow("already used");
  });

  it("persists failed OTP guesses, expires codes and disables phone sign-in outside demo mode", async () => {
    const challenge = await requestPhoneOtp(otpInput());
    const wrong = challenge.demoCode === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code: wrong })).rejects.toThrow("Incorrect code");
    expect((await db.phoneOtp.findUniqueOrThrow({ where: { id: challenge.challengeId } })).attempts).toBe(5);
    await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code: challenge.demoCode })).rejects.toThrow("expired");
    const expired = await requestPhoneOtp(otpInput());
    await db.phoneOtp.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
    await expect(verifyPhoneOtp({ challengeId: expired.challengeId, code: expired.demoCode })).rejects.toThrow("expired");
    const previous = process.env.DEMO_MODE;
    try {
      process.env.DEMO_MODE = "false";
      await expect(requestPhoneOtp(otpInput())).rejects.toThrow("not enabled");
      await expect(verifyPhoneOtp({ challengeId: expired.challengeId, code: expired.demoCode })).rejects.toThrow("not enabled");
    } finally { process.env.DEMO_MODE = previous; }
  });
});
