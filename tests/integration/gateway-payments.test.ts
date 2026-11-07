import { randomUUID, createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/lib/db";
import { checkout, getOrder, payOrder, advanceOrder, runOrderJobs } from "../../src/lib/orders";
import { applyGatewayPayment, applyGatewayRefund, initiateGatewayPayment, processGatewayRefund, reconcileGatewayRefunds, runGatewayJobs, verifyGatewayPayment } from "../../src/lib/gateway-payments";
import type { RazorpayPayment } from "../../src/lib/razorpay";
import type { AuthUser } from "../../src/lib/auth";

let customer: AuthUser, other: AuthUser;
const remoteId = (prefix: string) => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const input = () => ({ checkoutKey: randomUUID(), outletId: "kondapur", lines: [
  { itemId: "chicken-biryani", quantity: 1, portion: "regular" as const, addOnIds: [] },
], fulfillment: "pickup" as const, address: "", phone: "9000000000", note: "Gateway fixture" });
async function fixture(testMode = true) {
  const order = await checkout(input(), customer);
  const providerOrderId = remoteId("order");
  await db.gatewayOrder.create({ data: { orderId: order.id, receipt: `web_${order.id}`, providerOrderId, testMode } });
  const remote: RazorpayPayment = { id: remoteId("pay"), order_id: providerOrderId, amount: order.totalPaise,
    currency: "INR", status: "captured", captured: true, amount_refunded: 0, method: "upi" };
  return { order, remote };
}

beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  customer = await db.user.findUniqueOrThrow({ where: { id: "demo-customer" }, include: { outlet: true } });
  other = await db.user.create({ data: { name: "Gateway other", email: `${randomUUID()}@example.test`, passwordHash: "fixture" }, include: { outlet: true } });
});
beforeEach(() => {
  vi.stubEnv("PAYMENT_PROVIDER", "razorpay"); vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_fixture"); vi.stubEnv("RAZORPAY_KEY_SECRET", "fixture-secret");
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "fixture-webhook");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Unexpected external request in test")));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => db.$disconnect());

describe.sequential("Razorpay database lifecycle with mocked provider transport", () => {
  it("deduplicates simultaneous captures and ignores later failure notifications", async () => {
    const { order, remote } = await fixture();
    await Promise.all([applyGatewayPayment(remote), applyGatewayPayment(remote)]);
    await applyGatewayPayment({ ...remote, status: "failed", captured: false });
    const saved = await getOrder(order.id, customer);
    expect(saved.status).toBe("PLACED"); expect(saved.paymentStatus).toBe("PAID");
    expect(saved.payments).toHaveLength(1);
    expect(saved.messages.filter((message) => message.kind === "PLACED")).toHaveLength(1);
  });

  it("reuses one provider order for concurrent checkout-window requests", async () => {
    const { order, remote } = await fixture();
    const [first, second] = await Promise.all([initiateGatewayPayment(order.id, customer), initiateGatewayPayment(order.id, customer)]);
    expect(first).toEqual(second);
    expect(first.providerOrderId).toBe(remote.order_id);
    expect(first.amount).toBe(order.totalPaise);
    expect(first).not.toHaveProperty("keySecret");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("holds authorized funds outside the kitchen until capture", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment({ ...remote, status: "authorized", captured: false });
    await runOrderJobs();
    expect((await getOrder(order.id, customer)).status).toBe("PENDING_PAYMENT");
    await applyGatewayPayment(remote);
    expect((await getOrder(order.id, customer)).status).toBe("PLACED");
  });

  it("records payment-time features but excludes test payments from learned history", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const saved = await getOrder(order.id, customer);
    expect(saved.estimateSource).toBe("demo");
    expect(saved.estimateQueueWork).toBeGreaterThanOrEqual(0);
    expect(saved.estimateStations).toBe(saved.outlet.activeStations);
    expect(saved.estimateMinimumMinutes).toBe(saved.outlet.minPrepMinutes);
    expect(saved.estimateHour).toBeGreaterThanOrEqual(0);
    expect(saved.estimateHour).toBeLessThan(24);
    expect(saved.estimateModelVersion).toBe("rules-v1:demo-or-test-payment");
    expect(saved.estimateTrainingSamples).toBe(0);
  });

  it("persists honest live model provenance and safely falls back before sufficient history", async () => {
    const { order, remote } = await fixture(false);
    // Only the transport fixture uses this fake live-looking key. Fetch remains
    // blocked, and the isolated database is discarded after the test suite.
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_fixture_never_send");
    await applyGatewayPayment(remote);
    const saved = await getOrder(order.id, customer);
    expect(saved.estimateSource).toBe("live");
    expect(saved.payments[0].testMode).toBe(false);
    expect(saved.estimateModelVersion).toBe("rules-v1:insufficient-history");
    expect(saved.estimateFallback).toBe(true);
    expect(saved.estimateMinutes).toBeGreaterThanOrEqual(saved.outlet.minPrepMinutes);
    expect(saved.estimateValidationMae).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists payment test mode and never reconciles its IDs with live credentials", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const paid = await getOrder(order.id, customer);
    expect(paid.payments[0].testMode).toBe(true);
    await advanceOrder(order.id, "CANCELLED", paid.version, customer);
    vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_fixture_never_send");
    await processGatewayRefund(paid.payments[0].id);
    expect(fetch).not.toHaveBeenCalled();
    await runGatewayJobs();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes(remote.id) || String(url).includes(remote.order_id!))).toBe(false);
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toContain("gateway mode");
    expect((await getOrder(order.id, customer)).payments[0].status).toBe("REFUND_PENDING");
  });

  it("rejects mismatched amount and currency, and does not expose another customer's checkout", async () => {
    const { order, remote } = await fixture();
    await expect(applyGatewayPayment({ ...remote, amount: remote.amount + 1 })).rejects.toThrow("amount or currency");
    await expect(applyGatewayPayment({ ...remote, currency: "USD" })).rejects.toThrow("amount or currency");
    await expect(initiateGatewayPayment(order.id, other)).rejects.toThrow("not found");
    await expect(payOrder(order.id, { attemptKey: randomUUID(), method: "UPI", outcome: "success" }, customer)).rejects.toThrow("disabled");
  });

  it("uses server-side order identity and fetched capture state after Checkout signature verification", async () => {
    const { order, remote } = await fixture();
    const input = { razorpay_order_id: remote.order_id!, razorpay_payment_id: remote.id,
      razorpay_signature: createHmac("sha256", "fixture-secret").update(`${remote.order_id}|${remote.id}`).digest("hex") };
    await expect(verifyGatewayPayment(order.id, { ...input, razorpay_signature: "0".repeat(64) }, customer)).rejects.toThrow("verification failed");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...remote, status: "authorized", captured: false })));
    await verifyGatewayPayment(order.id, input, customer);
    expect((await getOrder(order.id, customer)).status).toBe("PENDING_PAYMENT");
  });

  it("queues refunds for captures after expiry, without falsely reporting money returned", async () => {
    const { order, remote } = await fixture();
    await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(0) } });
    await runOrderJobs();
    await applyGatewayPayment(remote);
    const saved = await getOrder(order.id, customer);
    expect(saved.status).toBe("CANCELLED"); expect(saved.paymentStatus).toBe("REFUND_PENDING");
    expect(saved.payments[0].status).toBe("REFUND_PENDING");
    expect(saved.messages.some((message) => message.kind === "PLACED")).toBe(false);
  });

  it("refunds an extra capture without changing the accepted original order", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const duplicate = { ...remote, id: remoteId("pay") };
    await applyGatewayPayment(duplicate);
    const saved = await getOrder(order.id, customer);
    expect(saved.paymentStatus).toBe("PAID"); expect(saved.status).toBe("PLACED");
    expect(saved.payments.filter((payment) => payment.status === "REFUND_PENDING")).toHaveLength(1);
    await applyGatewayRefund({ id: remoteId("rfnd"), payment_id: duplicate.id, amount: duplicate.amount, currency: "INR", status: "processed" });
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("PAID");
  });

  it("keeps a duplicate capture's refund error when the original capture is refunded", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const duplicate = { ...remote, id: remoteId("pay") };
    await applyGatewayPayment(duplicate);
    const duplicatePayment = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: duplicate.id } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: {
      code: "BAD_REQUEST_ERROR", description: "invalid request sent",
    } }, { status: 400 })));
    await processGatewayRefund(duplicatePayment.id);
    const rejected = await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(rejected.lastError).toContain("HTTP 400");

    const paid = await getOrder(order.id, customer);
    await advanceOrder(order.id, "CANCELLED", paid.version, customer);
    await applyGatewayRefund({ id: remoteId("rfnd"), payment_id: remote.id,
      amount: remote.amount, currency: "INR", status: "processed" });
    const partiallyResolved = await getOrder(order.id, customer);
    expect(partiallyResolved.payments.find((payment) => payment.providerPaymentId === remote.id)?.status).toBe("REFUNDED");
    expect(partiallyResolved.payments.find((payment) => payment.id === duplicatePayment.id)?.status).toBe("REFUND_PENDING");
    expect(partiallyResolved.paymentStatus).toBe("REFUND_PENDING");
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toBe(rejected.lastError);

    await applyGatewayRefund({ id: remoteId("rfnd"), payment_id: duplicate.id,
      amount: duplicate.amount, currency: "INR", status: "processed" });
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toBeNull();
  });

  it("cancels safely when stock changes and confirms only a processed refund", async () => {
    const { order, remote } = await fixture();
    await db.availability.update({ where: { outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" } }, data: { available: false } });
    try { await applyGatewayPayment(remote); }
    finally { await db.availability.update({ where: { outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" } }, data: { available: true } }); }
    const refund = { id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount, currency: "INR", status: "pending" as const };
    await applyGatewayRefund(refund);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUND_PENDING");
    await Promise.all([applyGatewayRefund({ ...refund, status: "processed" }), applyGatewayRefund({ ...refund, status: "processed" })]);
    const saved = await getOrder(order.id, customer);
    expect(saved.paymentStatus).toBe("REFUNDED");
    expect(saved.messages.filter((message) => message.kind.startsWith("REFUNDED_"))).toHaveLength(1);
  });

  it("cancellation persists a refund job and retries timeouts with the same provider key", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const paid = await getOrder(order.id, customer);
    await advanceOrder(order.id, "CANCELLED", paid.version, customer);
    const payment = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: remote.id } });
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Provider response was lost"))
      .mockResolvedValueOnce(Response.json({ id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount, currency: "INR", status: "processed" }));
    vi.stubGlobal("fetch", fetcher);
    await processGatewayRefund(payment.id);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUND_PENDING");
    await processGatewayRefund(payment.id);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
    expect(fetcher.mock.calls[0][1].headers["X-Refund-Idempotency"]).toBe(fetcher.mock.calls[1][1].headers["X-Refund-Idempotency"]);
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
  });

  it("keeps an externally started refund pending when its placed order is cancelled", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const refund = { id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount,
      currency: "INR", status: "pending" as const };
    await applyGatewayPayment({ ...remote, amount_refunded: remote.amount, status: "refunded" });
    await applyGatewayRefund(refund);
    const placed = await getOrder(order.id, customer);
    expect(placed.status).toBe("PLACED");
    expect(placed.paymentStatus).toBe("REFUND_PENDING");

    await advanceOrder(order.id, "CANCELLED", placed.version, customer);
    const cancelled = await getOrder(order.id, customer);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.paymentStatus).toBe("REFUND_PENDING");
    expect(cancelled.payments[0].status).toBe("REFUND_PENDING");
    expect(cancelled.payments[0].providerRefundId).toBe(refund.id);
    expect(cancelled.messages.find((message) => message.kind === "CANCELLED")?.body).toContain("refund is being processed");
    expect(cancelled.messages.some((message) => message.kind.startsWith("REFUNDED_"))).toBe(false);

    await applyGatewayRefund({ ...refund, status: "processed" });
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains rejected-refund diagnostics across payment polling and clears them only after refund confirmation", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const paid = await getOrder(order.id, customer);
    await advanceOrder(order.id, "CANCELLED", paid.version, customer);
    const payment = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: remote.id } });
    const rejected = vi.fn().mockResolvedValue(Response.json({ error: {
      code: "BAD_REQUEST_ERROR", description: "invalid request sent customer-private@example.test",
    } }, { status: 400 }));
    vi.stubGlobal("fetch", rejected);
    await processGatewayRefund(payment.id);
    let intent = await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(intent.lastError).toContain("HTTP 400");
    expect(intent.lastError).toContain("refund balance");
    expect(intent.lastError).not.toContain("customer-private");
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUND_PENDING");

    await db.payment.update({ where: { id: payment.id }, data: { refundNextAttemptAt: new Date(Date.now() + 3600_000) } });
    await db.gatewayOrder.update({ where: { id: intent.id }, data: { nextCheckAt: new Date(0) } });
    const poll = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith(`/orders/${remote.order_id}/payments`)) return Response.json({ items: [remote] });
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", poll);
    await runGatewayJobs();
    intent = await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(intent.lastError).toContain("HTTP 400");

    const confirmed = vi.fn().mockResolvedValue(Response.json({ id: remoteId("rfnd"),
      payment_id: remote.id, amount: remote.amount, currency: "INR", status: "processed" }));
    vi.stubGlobal("fetch", confirmed);
    await processGatewayRefund(payment.id);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toBeNull();
    expect(rejected.mock.calls[0][1].headers["X-Refund-Idempotency"]).toBe(confirmed.mock.calls[0][1].headers["X-Refund-Idempotency"]);
    expect(rejected.mock.calls[0][1].body).toBe(confirmed.mock.calls[0][1].body);
  });

  it("recovers a provider order created before the local reference write", async () => {
    const { order, remote } = await fixture();
    await db.gatewayOrder.update({ where: { orderId: order.id }, data: { providerOrderId: null } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: remote.order_id, amount: remote.amount,
      currency: "INR", receipt: `web_${order.id}`, status: "paid" })));
    await applyGatewayPayment(remote);
    expect((await getOrder(order.id, customer)).status).toBe("PLACED");
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).providerOrderId).toBe(remote.order_id);
  });

  it("keeps external partial refunds in durable review across successful reconciliation", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    const partial = { ...remote, amount_refunded: 1000 };
    await applyGatewayPayment(partial);
    let saved = await db.payment.findUniqueOrThrow({ where: { providerPaymentId: remote.id } });
    expect(saved.refundReviewRequired).toBe(true);
    expect(saved.providerRefundedPaise).toBe(1000);
    // A stale zero aggregate cannot dismiss a review marker.
    await applyGatewayPayment(remote);
    await db.gatewayOrder.update({ where: { orderId: order.id }, data: { nextCheckAt: new Date(0) } });
    const fetcher = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith(`/orders/${remote.order_id}/payments`)) return Response.json({ items: [partial] });
      if (url.includes(`/payments/${remote.id}/refunds?`)) return Response.json({ items: [
        { id: "rfnd_partialreview", payment_id: remote.id, amount: 1000, currency: "INR", status: "processed" },
      ] });
      return Response.json({ items: [] });
    });
    vi.stubGlobal("fetch", fetcher);
    await runGatewayJobs();
    saved = await db.payment.findUniqueOrThrow({ where: { id: saved.id } });
    expect(saved.refundReviewRequired).toBe(true);
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toContain("review");
    const calls = fetcher.mock.calls.length;
    await processGatewayRefund(saved.id);
    expect(fetcher.mock.calls.length).toBe(calls); // Never issue another full refund on partial money.
    await applyGatewayRefund({ id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount, currency: "INR", status: "processed" });
    saved = await db.payment.findUniqueOrThrow({ where: { id: saved.id } });
    expect(saved.refundReviewRequired).toBe(false);
    expect(saved.status).toBe("REFUNDED");
    expect(saved.providerRefundedPaise).toBe(remote.amount);
    expect((await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } })).lastError).toBeNull();
  });

  it("never calls a full aggregate refund processed while its refund entity is pending", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    // This is the provider's refund.created shape: aggregate can already be full.
    await applyGatewayPayment({ ...remote, amount_refunded: remote.amount, status: "refunded" });
    const refund = { id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount, currency: "INR", status: "pending" as const };
    await applyGatewayRefund(refund);
    let saved = await getOrder(order.id, customer);
    expect(saved.paymentStatus).toBe("REFUND_PENDING");
    expect(saved.payments[0].status).toBe("REFUND_PENDING");
    expect(saved.messages.some((message) => message.kind.startsWith("REFUNDED_"))).toBe(false);
    await applyGatewayRefund({ ...refund, status: "processed" });
    saved = await getOrder(order.id, customer);
    expect(saved.paymentStatus).toBe("REFUNDED");
    expect(saved.messages.filter((message) => message.kind.startsWith("REFUNDED_")).length).toBe(1);
  });

  it("clears review only when the sum of authoritative processed refund entities is full", async () => {
    const { order, remote } = await fixture();
    await applyGatewayPayment(remote);
    await applyGatewayPayment({ ...remote, amount_refunded: remote.amount / 2 });
    const first = { id: remoteId("rfnd"), payment_id: remote.id, amount: remote.amount / 2, currency: "INR", status: "processed" };
    const second = { ...first, id: remoteId("rfnd"), status: "pending" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ items: [first, second] }))
      .mockResolvedValueOnce(Response.json({ items: [first, { ...second, status: "processed" }] })));
    await reconcileGatewayRefunds(remote.id);
    expect((await db.payment.findUniqueOrThrow({ where: { providerPaymentId: remote.id } })).refundReviewRequired).toBe(true);
    expect((await getOrder(order.id, customer)).paymentStatus).not.toBe("REFUNDED");
    await reconcileGatewayRefunds(remote.id);
    expect((await db.payment.findUniqueOrThrow({ where: { providerPaymentId: remote.id } })).refundReviewRequired).toBe(false);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
  });

  it("does not create a fresh provider order while reconciling an expired checkout", async () => {
    const { order } = await fixture();
    await db.order.update({ where: { id: order.id }, data: { expiresAt: new Date(0) } });
    await runOrderJobs();
    await db.gatewayOrder.update({ where: { orderId: order.id }, data: { providerOrderId: null, nextCheckAt: new Date(0) } });
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetcher);
    await runGatewayJobs();
    const intent = await db.gatewayOrder.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(intent.providerOrderId).toBeNull();
    expect(intent.nextCheckAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60_000);
    expect(fetcher.mock.calls.some(([url, options]) => url === "https://api.razorpay.com/v1/orders" && options.method === "POST")).toBe(false);
  });
});
