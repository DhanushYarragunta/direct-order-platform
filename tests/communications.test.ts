import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationError, communicationCapabilities, sendEmail, sendSms, startPhoneVerification, checkPhoneVerification } from "../src/lib/communications";
import { notificationDeliveries, notificationFailure, notificationRecipient } from "../src/lib/notifications";
import { emailOtpRequestSchema } from "../src/lib/email-otp";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function liveConfig() {
  vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("EMAIL_PROVIDER", "resend"); vi.stubEnv("SMS_PROVIDER", "twilio");
  vi.stubEnv("RESEND_API_KEY", "test-secret"); vi.stubEnv("EMAIL_FROM", "Kitchen <kitchen@example.test>");
  vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`); vi.stubEnv("TWILIO_AUTH_TOKEN", "test-secret");
  vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", `VA${"a".repeat(32)}`); vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", `MG${"a".repeat(32)}`);
  vi.stubEnv("TRANSACTIONAL_EMAIL_ENABLED", "true"); vi.stubEnv("TRANSACTIONAL_SMS_ENABLED", "true");
}
describe("communications provider boundaries", () => {
  it("keeps demo capabilities simulated and prevents every live send", async () => {
    liveConfig(); vi.stubEnv("DEMO_MODE", "true");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(communicationCapabilities()).toMatchObject({ phoneCode: true, emailCode: true, transactionalEmail: "simulated" });
    expect(notificationDeliveries()).toEqual([{ channel: "EMAIL", provider: "demo", status: "SIMULATED" }, { channel: "SMS", provider: "demo", status: "SIMULATED" }]);
    await expect(sendEmail("customer@example.test", "Subject", "Text", "key")).rejects.toThrow("not enabled");
    await expect(sendSms("9000000000", "Text")).rejects.toThrow("not enabled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses a stable Resend idempotency key and does not treat acceptance as delivery", async () => {
    liveConfig(); const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    expect(await sendEmail("customer@example.test", "Order", "Text", "order-message/id")).toBe("email-id");
    expect(fetch).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": "order-message/id" }) }));
  });
  it("checks the exact Twilio verification SID and accepts only approved ownership", async () => {
    liveConfig(); const sid = `VE${"a".repeat(32)}`;
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ sid }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "pending", valid: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "approved", valid: true }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    expect(await startPhoneVerification("9000000000")).toBe(sid);
    expect(await checkPhoneVerification(sid, "123456")).toBe(false);
    expect(await checkPhoneVerification(sid, "123456")).toBe(true);
    expect((fetch.mock.calls[1][1].body as URLSearchParams).get("VerificationSid")).toBe(sid);
  });
  it("retries deduplicated email failures but marks uncertain SMS for review", async () => {
    liveConfig(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider secret should not be exposed")));
    const emailError = await sendEmail("customer@example.test", "Order", "Text", "key").catch(error => error);
    const smsError = await sendSms("9000000000", "Text").catch(error => error);
    expect(notificationFailure(emailError, 1).status).toBe("PENDING");
    expect(notificationFailure(smsError, 1).status).toBe("UNKNOWN");
    expect(String(smsError)).not.toContain("secret");
    expect(notificationFailure(new CommunicationError("HTTP_429", true), 1).status).toBe("PENDING");
    expect(notificationFailure(new CommunicationError("HTTP_401", false), 1).status).toBe("FAILED");
  });
  it("requires verified profile contacts at message creation and ignores checkout phone input", () => {
    const now = new Date(), user = { email: "customer@example.test", phone: "9000000000", emailVerifiedAt: null as Date | null, phoneVerifiedAt: null as Date | null, role: "CUSTOMER", deletedAt: null as Date | null };
    expect(notificationRecipient("SMS", user, now)).toBeNull();
    expect(notificationRecipient("EMAIL", { ...user, emailVerifiedAt: new Date(now.getTime() + 1) }, now)).toBeNull();
    expect(notificationRecipient("SMS", { ...user, phoneVerifiedAt: now }, now)).toBe(user.phone);
    expect(notificationRecipient("EMAIL", { ...user, emailVerifiedAt: now, deletedAt: now }, now)).toBeNull();
    expect(notificationRecipient("EMAIL", { ...user, emailVerifiedAt: now, role: "ADMIN" }, now)).toBeNull();
    expect(emailOtpRequestSchema.safeParse({ email: "phone@account.invalid", name: "Test", consent: true }).success).toBe(false);
  });
});
