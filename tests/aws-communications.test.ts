import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ emailSend: vi.fn(), smsSend: vi.fn(), emailConfig: vi.fn(), smsConfig: vi.fn() }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class { constructor(config: unknown) { mocks.emailConfig(config); } send = mocks.emailSend; },
  SendEmailCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => ({
  PinpointSMSVoiceV2Client: class { constructor(config: unknown) { mocks.smsConfig(config); } send = mocks.smsSend; },
  SendTextMessageCommand: class { constructor(public input: unknown) {} },
}));
import { communicationCapabilities, renderSmsTemplate, sendEmail, sendSms } from "../src/lib/communications";
import { notificationFailure } from "../src/lib/notifications";
import { notificationStatus } from "../src/lib/notifications";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function awsConfig() {
  vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("EMAIL_PROVIDER", "ses"); vi.stubEnv("SMS_PROVIDER", "aws");
  vi.stubEnv("AWS_REGION", "ap-south-1"); vi.stubEnv("EMAIL_FROM", "orders@sender.test");
  vi.stubEnv("AWS_SMS_ORIGINATION_IDENTITY", "registered-sender"); vi.stubEnv("AWS_SMS_ENTITY_ID", "entity-test");
  vi.stubEnv("AWS_SMS_OTP_TEMPLATE_ID", "otp-template-test"); vi.stubEnv("AWS_SMS_OTP_TEMPLATE", "TEST ONLY Code {{code}} expires in five minutes.");
  vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE_ID", "update-template-test"); vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "TEST ONLY Order {{orderNumber}}: {{message}} {{orderUrl}}");
  vi.stubEnv("AWS_SMS_MAX_PRICE_USD", "0.05");
  vi.stubEnv("AWS_SMS_ROUTE", "local");
}
describe("AWS customer communications", () => {
  it("uses SESv2 with the default credential chain and disables automatic send retries", async () => {
    awsConfig(); mocks.emailSend.mockResolvedValue({ MessageId: "ses-message" });
    expect(await sendEmail("customer@recipient.test", "Order update", "Order ready", "unused-on-ses")).toBe("ses-message");
    expect(mocks.emailConfig).toHaveBeenCalledWith({ region: "ap-south-1", maxAttempts: 1 });
    expect(mocks.emailSend.mock.calls[0][0].input).toMatchObject({ FromEmailAddress: "orders@sender.test", Destination: { ToAddresses: ["customer@recipient.test"] }, Content: { Simple: { Body: { Text: { Data: "Order ready" } } } } });
  });
  it("uses the approved India OTP template, cost cap and five-minute TTL", async () => {
    awsConfig(); mocks.smsSend.mockResolvedValue({ MessageId: "sms-message" });
    expect(await sendSms("9000000000", "", { purpose: "otp", code: "123456" })).toBe("sms-message");
    expect(mocks.smsConfig).toHaveBeenCalledWith({ region: "ap-south-1", maxAttempts: 1 });
    expect(mocks.smsSend.mock.calls[0][0].input).toMatchObject({ DestinationPhoneNumber: "+919000000000", OriginationIdentity: "registered-sender", DestinationCountryParameters: { IN_ENTITY_ID: "entity-test", IN_TEMPLATE_ID: "otp-template-test" }, MessageBody: "TEST ONLY Code 123456 expires in five minutes.", TimeToLive: 300, MaxPrice: "0.05", MessageType: "TRANSACTIONAL" });
  });
  it("rejects missing/mismatched templates and invalid cost caps before sending", async () => {
    awsConfig(); vi.stubEnv("AWS_SMS_OTP_TEMPLATE", "Missing placeholder");
    expect(communicationCapabilities().phoneCode).toBe(false);
    await expect(sendSms("9000000000", "", { purpose: "otp", code: "123456" })).rejects.toThrow("not enabled");
    expect(mocks.smsSend).not.toHaveBeenCalled();
    vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "{{orderNumber}} {{message}} {{unknown}}");
    expect(() => renderSmsTemplate("update", { orderNumber: "WEB-1", message: "Ready" })).toThrow("not configured");
    vi.stubEnv("AWS_SMS_MAX_PRICE_USD", "5.00");
    expect(communicationCapabilities().phoneCode).toBe(false);
  });
  it("sends international SMS without a sender or DLT parameters only when explicitly selected", async () => {
    awsConfig(); vi.stubEnv("AWS_SMS_ROUTE", "international");
    vi.stubEnv("AWS_SMS_ORIGINATION_IDENTITY", ""); vi.stubEnv("AWS_SMS_ENTITY_ID", "");
    vi.stubEnv("AWS_SMS_OTP_TEMPLATE_ID", ""); vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE_ID", "");
    vi.stubEnv("AWS_SMS_MAX_PRICE_USD", "0.08");
    mocks.smsSend.mockResolvedValue({ MessageId: "international-message" });
    expect(communicationCapabilities().phoneCode).toBe(true);
    await sendSms("9000000000", "Ignored arbitrary text", { purpose: "otp", code: "123456" });
    const request = mocks.smsSend.mock.calls[0][0].input;
    expect(request).toMatchObject({ DestinationPhoneNumber: "+919000000000", MessageBody: "TEST ONLY Code 123456 expires in five minutes.", MaxPrice: "0.08", TimeToLive: 300, MessageType: "TRANSACTIONAL" });
    expect(request).not.toHaveProperty("OriginationIdentity");
    expect(request).not.toHaveProperty("DestinationCountryParameters");
  });
  it("never silently switches incomplete local configuration to international SMS", async () => {
    awsConfig(); vi.stubEnv("AWS_SMS_ROUTE", ""); vi.stubEnv("AWS_SMS_ENTITY_ID", "");
    expect(communicationCapabilities().phoneCode).toBe(false);
    await expect(sendSms("9000000000", "", { purpose: "otp", code: "123456" })).rejects.toThrow("not enabled");
    vi.stubEnv("AWS_SMS_ROUTE", "typo");
    expect(communicationCapabilities().phoneCode).toBe(false);
    expect(mocks.smsSend).not.toHaveBeenCalled();
  });
  it("keeps international templates validated and order updates independently disabled", async () => {
    awsConfig(); vi.stubEnv("AWS_SMS_ROUTE", "international");
    vi.stubEnv("TRANSACTIONAL_SMS_ENABLED", "false");
    expect(communicationCapabilities()).toMatchObject({ phoneCode: true, transactionalSms: "disabled" });
    vi.stubEnv("AWS_SMS_OTP_TEMPLATE", "{{code}} {{unknown}}");
    expect(communicationCapabilities().phoneCode).toBe(false);
    await expect(sendSms("9000000000", "", { purpose: "otp", code: "123456" })).rejects.toThrow("not enabled");
    vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "Order {{orderNumber}}: {{status}} {{orderUrl}}");
    mocks.smsSend.mockResolvedValue({ MessageId: "international-update" });
    const orderUrl = "https://example.test/orders/cm123456789012345678901234";
    await sendSms("9000000000", "", { purpose: "update", orderNumber: "WEB-1", orderId: "cm123456789012345678901234", status: "Test Order confirmed", message: "", orderUrl });
    expect(mocks.smsSend.mock.calls[0][0].input).toMatchObject({ MessageBody: `Order WEB-1: Test Order confirmed ${orderUrl}`, TimeToLive: 3600 });
    expect(() => renderSmsTemplate("update", { orderNumber: "WEB-1", status: "Ready", orderUrl: "x".repeat(1600) })).toThrow("message limit");
  });
  it("supports short approved status templates without inserting the full update", async () => {
    awsConfig(); vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "TEST ONLY Order {{orderNumber}} is {{status}}.");
    expect(renderSmsTemplate("update", { orderNumber: "WEB-123", status: notificationStatus("LATE"), message: "Long update is intentionally absent." }))
      .toBe("TEST ONLY Order WEB-123 is Preparation delayed.");
    expect(notificationStatus("OVERRIDE_12").length).toBeLessThanOrEqual(25);
    for (const kind of ["PLACED", "PREPARING", "READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "REFUND", "LATE", "OVERRIDE_12", "REFUND_PENDING_1", "REFUNDED_1", "UNKNOWN"]) {
      expect(notificationStatus(kind, true)).toMatch(/^Test /);
      expect(notificationStatus(kind, true).length).toBeLessThanOrEqual(30);
    }
  });
  it("rejects oversized Indian DLT variables before sending and supports a static URL with orderId", async () => {
    awsConfig();
    const context = { purpose: "update" as const, orderNumber: "WEB-123", orderId: "cm123456789012345678901234", status: "Order confirmed", message: "x".repeat(31), orderUrl: "https://example.test/orders/cm123456789012345678901234" };
    await expect(sendSms("9000000000", "", context)).rejects.toThrow("30-character");
    expect(mocks.smsSend).not.toHaveBeenCalled();
    vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "TEST ONLY {{orderNumber}}: {{status}} https://example.test/orders/{{orderId}}");
    mocks.smsSend.mockResolvedValue({ MessageId: "sms-message" });
    await expect(sendSms("9000000000", "", context)).resolves.toBe("sms-message");
    expect(mocks.smsSend.mock.calls[0][0].input.MessageBody).toBe(`TEST ONLY WEB-123: Order confirmed https://example.test/orders/${context.orderId}`);
    vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "{{orderNumber}} {{status}} {{orderUrl}}");
    await expect(sendSms("9000000000", "", { ...context, message: "Ready" })).rejects.toThrow("30-character");
    expect(mocks.smsSend).toHaveBeenCalledTimes(1);
    vi.stubEnv("AWS_SMS_UPDATE_TEMPLATE", "{{orderNumber}} {{message}}");
    expect(renderSmsTemplate("update", { orderNumber: "WEB-123", message: "x".repeat(30) })).toBe(`WEB-123 ${"x".repeat(30)}`);
  });
  it("never blindly retries uncertain SES/SMS acceptance, while explicit throttling can retry", async () => {
    awsConfig(); mocks.emailSend.mockRejectedValue(new Error("private provider diagnostics"));
    const error = await sendEmail("customer@recipient.test", "Order", "Ready", "key").catch(error => error);
    expect(notificationFailure(error, 1)).toMatchObject({ status: "UNKNOWN", lastErrorCode: "AWS_ACCEPTANCE_UNCERTAIN" });
    expect(String(error)).not.toContain("private");
    mocks.smsSend.mockRejectedValue({ name: "ThrottlingException", $metadata: { httpStatusCode: 400 } });
    const throttled = await sendSms("9000000000", "", { purpose: "otp", code: "123456" }).catch(error => error);
    expect(notificationFailure(throttled, 1).status).toBe("PENDING");
  });
});
