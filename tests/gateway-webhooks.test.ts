import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ createMany: vi.fn(), updateMany: vi.fn() }));
vi.mock("../src/lib/db", () => ({ db: { gatewayWebhook: database } }));
import { enqueueGatewayWebhook, gatewayWebhookRecord } from "../src/lib/gateway-webhooks";
import { POST } from "../src/app/api/payments/razorpay/webhook/route";

const event = { event: "payment.captured", payload: { payment: { entity: { id: "pay_webhooktest" } } } };
const request = (input: unknown, eventId = "untrusted-event-header") => {
  const raw = JSON.stringify(input);
  return new Request("https://shop.example/api/payments/razorpay/webhook", { method: "POST", body: raw,
    headers: { "x-razorpay-signature": createHmac("sha256", "webhook-fixture").update(raw).digest("hex"), "x-razorpay-event-id": eventId } });
};
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fixture");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "fixture-secret");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "webhook-fixture");
  vi.stubEnv("RAZORPAY_PREVIOUS_WEBHOOK_SECRET", "");
  database.createMany.mockResolvedValue({ count: 1 });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("No provider call belongs on the webhook acknowledgement path")));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });

it("stores only canonical references and deduplicates independently of unsigned event headers", async () => {
  const input = { ...event, account_id: "private-account", payload: { payment: { entity: {
    id: "pay_webhooktest", email: "customer@example.test", contact: "private-phone", notes: { secret: "private-notes" },
  } } } };
  expect((await POST(request(input, "one"))).status).toBe(200);
  expect((await POST(request(event, "different"))).status).toBe(200);
  const first = database.createMany.mock.calls[0][0], second = database.createMany.mock.calls[1][0];
  expect(first).toEqual(second);
  expect(first.skipDuplicates).toBe(true);
  expect(first.data).toMatchObject({ event: "payment.captured", paymentId: "pay_webhooktest", testMode: true });
  expect(JSON.stringify(first)).not.toMatch(/private|customer|untrusted|different/);
  expect(fetch).not.toHaveBeenCalled();
});

it("separates payment stages, entities and test/live modes while ignoring unsupported events", () => {
  const original = gatewayWebhookRecord(event, true)!;
  expect(gatewayWebhookRecord(event, false)!.dedupeKey).not.toBe(original.dedupeKey);
  expect(gatewayWebhookRecord({ ...event, event: "payment.failed" }, true)!.dedupeKey).not.toBe(original.dedupeKey);
  expect(gatewayWebhookRecord({ event: "payment.captured", payload: { payment: { entity: { id: "pay_other" } } } }, true)!.dedupeKey).not.toBe(original.dedupeKey);
  expect(gatewayWebhookRecord({ event: "refund.created", payload: { refund: { entity: { id: "rfnd_test", payment_id: "pay_webhooktest" } } } }, true)).toMatchObject({
    event: "refund.created", paymentId: null, refundId: "rfnd_test", refundPaymentId: "pay_webhooktest", testMode: true,
  });
  expect(gatewayWebhookRecord({ event: "unrelated.event", payload: {} }, true)).toBeNull();
  expect(() => gatewayWebhookRecord({ event: "payment.captured", payload: {} }, true)).toThrow("missing its event reference");
});

it("rejects an invalid HMAC before writing an inbox row", async () => {
  const signed = request(event);
  signed.headers.set("x-razorpay-signature", "0".repeat(64));
  const response = await POST(signed);
  expect(response.status).toBe(400);
  expect(database.createMany).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not acknowledge until storage succeeds and makes failed storage retryable", async () => {
  let release!: () => void;
  database.createMany.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  let finished = false;
  const pending = enqueueGatewayWebhook(event).then(result => { finished = true; return result; });
  await Promise.resolve();
  expect(finished).toBe(false);
  release();
  await expect(pending).resolves.toEqual({ received: true });
  vi.spyOn(console, "error").mockImplementation(() => {});
  database.createMany.mockRejectedValueOnce(new Error("private database information"));
  const response = await POST(request(event));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private");
});

it("returns a retryable response within the provider deadline when storage stalls", async () => {
  vi.useFakeTimers();
  database.createMany.mockImplementationOnce(() => new Promise(() => {}));
  const response = POST(request(event));
  await vi.advanceTimersByTimeAsync(3000);
  expect((await response).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
