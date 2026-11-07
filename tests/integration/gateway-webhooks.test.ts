import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db";
import { checkout, getOrder } from "../../src/lib/orders";
import { handleGatewayWebhook, runGatewayJobs } from "../../src/lib/gateway-payments";
import { enqueueGatewayWebhook, gatewayWebhookRecord, runGatewayWebhookJobs, GATEWAY_WEBHOOK_MAX_ATTEMPTS, type GatewayWebhookEvent } from "../../src/lib/gateway-webhooks";

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const event = (): GatewayWebhookEvent => ({ event: "payment.captured", payload: { payment: { entity: { id: id("pay") } } } });
let inboxIds: string[] = [], orderIds: string[] = [], userIds: string[] = [];
async function enqueue(input = event()) {
  await enqueueGatewayWebhook(input);
  const record = await db.gatewayWebhook.findUniqueOrThrow({ where: { dedupeKey: gatewayWebhookRecord(input, true)!.dedupeKey } });
  inboxIds.push(record.id);
  return { input, record };
}
beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("PAYMENT_PROVIDER", "razorpay");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fixture"); vi.stubEnv("RAZORPAY_KEY_SECRET", "fixture-secret");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "fixture-webhook");
  vi.stubEnv("TRANSACTIONAL_EMAIL_ENABLED", "false"); vi.stubEnv("TRANSACTIONAL_SMS_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request in test")));
});
afterEach(async () => {
  await db.gatewayWebhook.deleteMany({ where: { id: { in: inboxIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  inboxIds = []; orderIds = []; userIds = [];
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
afterAll(() => db.$disconnect());

it("durably coalesces concurrent deliveries and claims each event only once across workers", async () => {
  const input = event();
  await Promise.all([enqueueGatewayWebhook(input), enqueueGatewayWebhook(input)]);
  const { record } = await enqueue(input);
  expect(await db.gatewayWebhook.count({ where: { dedupeKey: record.dedupeKey } })).toBe(1);
  expect(record.status).toBe("PENDING");
  expect(fetch).not.toHaveBeenCalled();
  const handler = vi.fn().mockResolvedValue({ received: true });
  await Promise.all([runGatewayWebhookJobs(handler), runGatewayWebhookJobs(handler)]);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: "PROCESSED", attempts: 1, leaseToken: null, lastErrorCode: null });
  await enqueueGatewayWebhook(input);
  await runGatewayWebhookJobs(handler);
  expect(handler).toHaveBeenCalledTimes(1);
});

it("recovers a crash after settlement without accepting a second kitchen order", async () => {
  const user = await db.user.create({ data: { name: "Webhook recovery", email: `${randomUUID()}@example.test`, passwordHash: "fixture-only" }, include: { outlet: true } });
  userIds.push(user.id);
  const order = await checkout({ checkoutKey: randomUUID(), outletId: "kondapur", fulfillment: "pickup", address: "", phone: "9000000000", note: "Webhook test",
    lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular", addOnIds: [] }] }, user);
  orderIds.push(order.id);
  const providerOrderId = id("order"), providerPaymentId = id("pay");
  await db.gatewayOrder.create({ data: { orderId: order.id, receipt: `web_${order.id}`, providerOrderId, testMode: true } });
  const remote = { id: providerPaymentId, order_id: providerOrderId, amount: order.totalPaise,
    currency: "INR", status: "captured", captured: true, amount_refunded: 0, method: "upi" };
  const fetcher = vi.fn(async (url: string) => {
    if (url === `https://api.razorpay.com/v1/orders/${providerOrderId}/payments`) return Response.json({ items: [remote] });
    if (url !== `https://api.razorpay.com/v1/payments/${providerPaymentId}`) throw new Error("Unexpected provider request");
    return Response.json(remote);
  });
  vi.stubGlobal("fetch", fetcher);
  const { input, record } = await enqueue({ event: "payment.captured", payload: { payment: { entity: { id: providerPaymentId } } } });
  await handleGatewayWebhook(input);
  // Settlement committed, then the process stopped before marking its inbox row.
  await db.gatewayWebhook.update({ where: { id: record.id }, data: { status: "IN_FLIGHT", attempts: 1, leaseToken: "expired-worker", leasedUntil: new Date(0) } });
  await runGatewayJobs();
  const saved = await getOrder(order.id, user);
  expect(saved).toMatchObject({ status: "PLACED", paymentStatus: "PAID" });
  expect(saved.payments).toHaveLength(1);
  expect(saved.messages.filter(message => message.kind === "PLACED")).toHaveLength(1);
  expect(await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: "PROCESSED", attempts: 2 });
});

it("backs off failures, preserves safe diagnostic codes and stops after the bounded retry allowance", async () => {
  const { input, record } = await enqueue();
  const handler = vi.fn().mockRejectedValue(new Error("private provider response with credentials"));
  await runGatewayWebhookJobs(handler);
  let saved = await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } });
  expect(saved).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "PROVIDER_RECONCILIATION_FAILED" });
  expect(saved.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
  expect(JSON.stringify(saved)).not.toContain("private");
  await runGatewayWebhookJobs(handler);
  expect(handler).toHaveBeenCalledTimes(1);
  await db.gatewayWebhook.update({ where: { id: record.id }, data: { attempts: GATEWAY_WEBHOOK_MAX_ATTEMPTS - 1, nextAttemptAt: new Date(0) } });
  await runGatewayWebhookJobs(handler);
  saved = await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } });
  expect(saved).toMatchObject({ status: "FAILED", attempts: GATEWAY_WEBHOOK_MAX_ATTEMPTS, lastErrorCode: "RETRY_LIMIT_REACHED" });
  await enqueueGatewayWebhook(input);
  await runGatewayWebhookJobs(handler);
  expect(handler).toHaveBeenCalledTimes(2);
});

it("holds old-mode events without spending attempts and resumes when matching credentials return", async () => {
  const { record } = await enqueue();
  const handler = vi.fn().mockResolvedValue(undefined);
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_fixture_never_send");
  await runGatewayWebhookJobs(handler);
  expect(handler).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: "BLOCKED", attempts: 0, testMode: true, lastErrorCode: "GATEWAY_MODE_CHANGED" });
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fixture");
  await runGatewayWebhookJobs(handler);
  expect(handler).toHaveBeenCalledTimes(1);
  expect(await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: "PROCESSED", attempts: 1 });
});

it("does not let an expired worker overwrite a replacement worker's completed result", async () => {
  const { record } = await enqueue();
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const release = new Promise<void>(resolve => { finish = resolve; });
  const oldWorker = runGatewayWebhookJobs(async () => { entered(); await release; throw new Error("Old request failed after lease expiration"); });
  await started;
  await db.gatewayWebhook.update({ where: { id: record.id }, data: { leasedUntil: new Date(0) } });
  await runGatewayWebhookJobs(async () => {});
  finish();
  await oldWorker;
  expect(await db.gatewayWebhook.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ status: "PROCESSED", attempts: 2, lastErrorCode: null, leaseToken: null });
});
