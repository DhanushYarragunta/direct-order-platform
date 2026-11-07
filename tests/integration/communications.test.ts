import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { requestEmailOtp, verifyEmailOtp } from "../../src/lib/email-otp";
import { requestPhoneOtp, verifyPhoneOtp } from "../../src/lib/phone-otp";
import { notificationDeliveries, runNotificationJobs } from "../../src/lib/notifications";
import { deleteAccount, exportAccount } from "../../src/lib/privacy";
import * as communications from "../../src/lib/communications";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => db.$disconnect());
const emailInput = () => ({ email: `verified-${randomUUID()}@customer.test`, name: "Verified customer", consent: true as const, marketingOptIn: false });
const phoneInput = () => ({ phone: `7${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, name: "Verified customer", consent: true as const, marketingOptIn: false });
function liveConfig() {
  vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("EMAIL_PROVIDER", "resend"); vi.stubEnv("SMS_PROVIDER", "twilio");
  vi.stubEnv("RESEND_API_KEY", "fake-test-key"); vi.stubEnv("EMAIL_FROM", "Kitchen <kitchen@sender.test>");
  vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`); vi.stubEnv("TWILIO_AUTH_TOKEN", "fake-test-key");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", `VA${"a".repeat(32)}`); vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", `MG${"a".repeat(32)}`);
  vi.stubEnv("TRANSACTIONAL_EMAIL_ENABLED", "true"); vi.stubEnv("TRANSACTIONAL_SMS_ENABLED", "true");
}
function emailTransport() {
  let code = "";
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url !== "https://api.resend.com/emails") throw new Error("Unexpected provider request");
    const sent = JSON.parse(String(init.body)); code = /code is (\d{6})/.exec(sent.text)?.[1] || "";
    return new Response(JSON.stringify({ id: `email-${randomUUID()}` }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, code: () => code };
}
describe.sequential("verified contacts and durable notifications", () => {
  it("verifies real email ownership without returning codes and consumes them once", async () => {
    liveConfig(); const transport = emailTransport(), input = emailInput();
    const challenge = await requestEmailOtp(input);
    expect(challenge).not.toHaveProperty("demoCode");
    expect(transport.code()).toMatch(/^\d{6}$/);
    expect((await db.emailOtp.findUniqueOrThrow({ where: { id: challenge.challengeId } })).codeHash).not.toContain(transport.code());
    const result = await verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() });
    expect(result).toMatchObject({ role: "CUSTOMER", marketingOptIn: false });
    expect(result.emailVerifiedAt).not.toBeNull();
    await expect(verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() })).rejects.toThrow("already used");
    const exported = JSON.stringify(await exportAccount(result.id));
    expect(exported).not.toContain("codeHash"); expect(exported).not.toContain(transport.code());
  });
  it("binds contact linking to the requesting account and never merges staff or another customer", async () => {
    liveConfig(); const transport = emailTransport();
    const user = await db.user.create({ data: { email: `phone-${randomUUID()}@account.invalid`, name: "Phone customer", passwordHash: "phone-only" } });
    const input = { ...emailInput(), purpose: "verify_contact" as const };
    const challenge = await requestEmailOtp(input, user.id);
    await expect(verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() }, "another-user")).rejects.toThrow("expired");
    const verified = await verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() }, user.id);
    expect(verified.id).toBe(user.id); expect(verified.email).toBe(input.email); expect(verified.emailVerifiedAt).not.toBeNull();
    const staff = await db.user.create({ data: { email: emailInput().email, name: "Staff account", passwordHash: "staff-only", role: "ADMIN" } });
    const staffChallenge = await requestEmailOtp({ email: staff.email, name: "Staff", consent: true });
    await expect(verifyEmailOtp({ challengeId: staffChallenge.challengeId, code: transport.code() })).rejects.toThrow("customer email codes");
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).emailVerifiedAt).toBeNull();
  });
  it("revokes unverified pre-registration access when the email owner recovers the account", async () => {
    liveConfig(); const transport = emailTransport(), input = emailInput();
    const preregistered = await db.user.create({ data: { email: input.email, name: input.name, passwordHash: "untrusted-password", phone: phoneInput().phone } });
    await db.session.create({ data: { id: randomUUID(), userId: preregistered.id, expiresAt: new Date(Date.now() + 60000) } });
    const challenge = await requestEmailOtp(input);
    const verified = await verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() });
    expect(verified).toMatchObject({ id: preregistered.id, passwordHash: "email-only", phone: null, phoneVerifiedAt: null });
    expect(await db.session.count({ where: { userId: verified.id } })).toBe(0);
  });
  it("preserves a verified phone owner when an unauthenticated email claimant requests access", async () => {
    liveConfig(); const transport = emailTransport(), input = emailInput(), phone = phoneInput().phone;
    const owner = await db.user.create({ data: { email: input.email, name: input.name, passwordHash: "phone-only", phone, phoneVerifiedAt: new Date() } });
    const challenge = await requestEmailOtp(input);
    await expect(verifyEmailOtp({ challengeId: challenge.challengeId, code: transport.code() })).rejects.toThrow("verified phone");
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({ phone, passwordHash: "phone-only", emailVerifiedAt: null });
    const linked = await requestEmailOtp({ ...input, purpose: "verify_contact" }, owner.id);
    const user = await verifyEmailOtp({ challengeId: linked.challengeId, code: transport.code() }, owner.id);
    expect(user.phone).toBe(phone); expect(user.emailVerifiedAt).not.toBeNull();
  });
  it("persists email guess limits and never promotes a demo code to live ownership", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const challenge = await requestEmailOtp(emailInput());
    expect(challenge.demoCode).toMatch(/^\d{6}$/);
    const wrong = challenge.demoCode === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) await expect(verifyEmailOtp({ challengeId: challenge.challengeId, code: wrong })).rejects.toThrow("Incorrect code");
    expect((await db.emailOtp.findUniqueOrThrow({ where: { id: challenge.challengeId } })).attempts).toBe(5);
    await expect(verifyEmailOtp({ challengeId: challenge.challengeId, code: challenge.demoCode! })).rejects.toThrow("expired");
    const next = await requestEmailOtp(emailInput());
    const demoUser = await verifyEmailOtp({ challengeId: next.challengeId, code: next.demoCode! });
    expect(demoUser.emailVerifiedAt).toBeNull();
    const blocked = await requestEmailOtp(emailInput()); liveConfig(); emailTransport();
    await expect(verifyEmailOtp({ challengeId: blocked.challengeId, code: blocked.demoCode! })).rejects.toThrow("expired");
  });
  it("uses Twilio Verify ownership in live mode and never returns the provider code", async () => {
    liveConfig(); const sid = `VE${"b".repeat(32)}`;
    const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/Verifications") ? { sid } : { status: "approved", valid: true }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    const challenge = await requestPhoneOtp(phoneInput());
    expect(challenge).not.toHaveProperty("demoCode");
    const verified = await verifyPhoneOtp({ challengeId: challenge.challengeId, code: "123456" });
    expect(verified.phoneVerifiedAt).not.toBeNull();
    await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code: "123456" })).rejects.toThrow("already used");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("verifies a hashed AWS SMS code locally only after a live provider request", async () => {
    liveConfig(); vi.stubEnv("SMS_PROVIDER", "aws"); vi.stubEnv("AWS_REGION", "ap-south-1");
    vi.stubEnv("AWS_SMS_ORIGINATION_IDENTITY", "registered-test"); vi.stubEnv("AWS_SMS_ENTITY_ID", "entity-test");
    vi.stubEnv("AWS_SMS_OTP_TEMPLATE_ID", "otp-test"); vi.stubEnv("AWS_SMS_OTP_TEMPLATE", "TEST ONLY Code {{code}}");
    let code = "";
    const send = vi.spyOn(communications, "sendSms").mockImplementation(async (_phone, _text, context) => {
      if (context?.purpose !== "otp") throw new Error("Expected OTP context");
      code = context.code; return "aws-sms-id";
    });
    const challenge = await requestPhoneOtp(phoneInput());
    expect(challenge).not.toHaveProperty("demoCode"); expect(code).toMatch(/^\d{6}$/);
    const record = await db.phoneOtp.findUniqueOrThrow({ where: { id: challenge.challengeId } });
    expect(record).toMatchObject({ provider: "aws", providerId: "aws-sms-id" });
    expect(record.codeHash).not.toBe(code);
    const wrong = code === "000000" ? "000001" : "000000";
    await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code: wrong })).rejects.toThrow("Incorrect code");
    const user = await verifyPhoneOtp({ challengeId: challenge.challengeId, code });
    expect(user.phoneVerifiedAt).not.toBeNull(); expect(send).toHaveBeenCalledTimes(1);
    await expect(verifyPhoneOtp({ challengeId: challenge.challengeId, code })).rejects.toThrow("already used");
  });
  it("claims each channel once across workers and deletes pending messages with account erasure", async () => {
    liveConfig();
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_current_config");
    const fetch = vi.fn(async (url: string, _init: RequestInit) => new Response(JSON.stringify(url.includes("resend") ? { id: "email-accepted" } : { sid: `SM${"b".repeat(32)}` }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    const user = await db.user.create({ data: { email: emailInput().email, phone: phoneInput().phone, name: "Updates customer", passwordHash: "test-only", emailVerifiedAt: new Date(Date.now() - 1000), phoneVerifiedAt: new Date(Date.now() - 1000) }, include: { outlet: true } });
    const order = await db.order.create({ data: { number: `COMMS-${randomUUID()}`, userId: user.id, outletId: "kondapur", checkoutKey: randomUUID(), cartHash: "test",
      status: "DELIVERED", paymentStatus: "PAID", fulfillment: "delivery", address: "", phone: "9999999999", note: "", totalPaise: 32000, gstPaise: 1524, workMinutes: 10, expiresAt: new Date(),
      gatewayOrder: { create: { receipt: `comms-test-${randomUUID()}`, testMode: true, nextCheckAt: new Date(Date.now() + 7 * 86400_000) } },
    } });
    const message = await db.message.create({ data: { orderId: order.id, kind: "COMMS_TEST", body: "Your order is ready.", deliveries: { create: notificationDeliveries() } } });
    await Promise.all([runNotificationJobs(), runNotificationJobs()]);
    expect(fetch).toHaveBeenCalledTimes(2);
    const deliveries = await db.messageDelivery.findMany({ where: { messageId: message.id } });
    expect(deliveries).toHaveLength(2); expect(deliveries.every(d => d.status === "ACCEPTED" && d.attempts === 1)).toBe(true);
    expect((fetch.mock.calls.find(([url]) => url.includes("twilio"))![1] as RequestInit).body?.toString()).toContain(encodeURIComponent(`+91${user.phone}`));
    const email = JSON.parse(String(fetch.mock.calls.find(([url]) => url.includes("resend"))![1].body));
    expect(email.subject).toMatch(/^Test order update/);
    expect(email.text).toContain("No real payment was collected.");
    expect((fetch.mock.calls.find(([url]) => url.includes("twilio"))![1].body as URLSearchParams).get("Body")).toContain("Test order");
    const queued = await db.message.create({ data: { orderId: order.id, kind: "COMMS_DELETE", body: "No delivery after deletion.", deliveries: { create: notificationDeliveries() } } });
    await deleteAccount(user);
    await runNotificationJobs();
    expect(await db.messageDelivery.count({ where: { messageId: queued.id } })).toBe(0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
