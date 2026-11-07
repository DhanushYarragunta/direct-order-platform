import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { serviceReadiness } from "../../src/lib/service-readiness";
import { persistWorkerStatus } from "../../src/lib/worker-status";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
afterAll(() => db.$disconnect());

it("surfaces stalled payment updates without exposing deduplication or worker lease tokens", async () => {
  const marker = randomUUID(), old = new Date("1900-01-01T00:00:00.000Z");
  const baseline = await serviceReadiness();
  const rows = ["PENDING", "FAILED", "BLOCKED"].map((status) => ({
    id: `${marker}-${status}`, dedupeKey: `private-dedupe-${marker}-${status}`, event: "payment.captured",
    paymentId: `pay_${marker.replaceAll("-", "")}`, testMode: true, status, receivedAt: old,
    attempts: status === "FAILED" ? 8 : 0,
    leaseToken: `private-lease-${marker}`,
    lastErrorCode: status === "FAILED" ? "RETRY_LIMIT_REACHED" : status === "BLOCKED" ? "GATEWAY_MODE_CHANGED" : null,
  }));
  try {
    await db.gatewayWebhook.createMany({ data: rows });
    const result = await serviceReadiness();
    expect(result.queues.queuedWebhooks).toBe(baseline.queues.queuedWebhooks + 1);
    expect(result.queues.webhookAttention).toBe(baseline.queues.webhookAttention + 2);
    expect(result.queueTiming.oldestWebhookAt).toBe(old.toISOString());
    expect(result.webhookIssues.filter(row => row.id.startsWith(marker))).toHaveLength(2);
    expect(result.webhookIssues.find(row => row.id === `${marker}-FAILED`)).toMatchObject({
      attempts: 8, status: "FAILED", lastErrorCode: "RETRY_LIMIT_REACHED", paymentId: rows[0].paymentId,
    });
    expect(JSON.stringify(result)).not.toContain("private-dedupe");
    expect(JSON.stringify(result)).not.toContain("private-lease");
  } finally {
    await db.gatewayWebhook.deleteMany({ where: { id: { in: rows.map(row => row.id) } } });
  }
});

it("persists independent worker failures without leaking exception details and records recovery", async () => {
  const processId = randomUUID(), now = new Date();
  const common = { processId, startedAt: new Date(now.getTime() - 1000), finishedAt: now,
    succeededAt: now, failedAt: null, consecutiveFailures: 0, lastErrorCode: null, updatedAt: now };
  try {
    await persistWorkerStatus({ ...common, job: "orders" });
    await persistWorkerStatus({ ...common, job: "notifications" });
    await persistWorkerStatus({ ...common, job: "payments", succeededAt: null, failedAt: now,
      consecutiveFailures: 2, lastErrorCode: "private-provider-error-with-secret" });
    const failed = await serviceReadiness();
    expect(failed.workers.find(worker => worker.job === "orders")?.status).toBe("healthy");
    expect(failed.workers.find(worker => worker.job === "payments")).toMatchObject({ status: "failed", consecutiveFailures: 2, lastErrorCode: "JOB_FAILED" });
    expect(JSON.stringify(failed)).not.toContain("private-provider-error");
    expect((await db.workerStatus.findUniqueOrThrow({ where: { processId_job: { processId, job: "payments" } } })).lastErrorCode).toBe("JOB_FAILED");
    await persistWorkerStatus({ ...common, job: "payments" });
    const recovered = await serviceReadiness();
    expect(recovered.workers.find(worker => worker.job === "payments")).toMatchObject({ status: "healthy", consecutiveFailures: 0, lastErrorCode: null });
    expect(await db.workerStatus.count({ where: { processId } })).toBe(3);
  } finally {
    await db.workerStatus.deleteMany({ where: { processId } });
  }
});

it("shows recovery references and queue age while excluding active leases from overdue checks", async () => {
  const id = randomUUID(), old = new Date("1900-01-01T00:00:00.000Z");
  const user = await db.user.create({ data: { email: `services-${id}@example.test`, name: "Service diagnostics fixture", passwordHash: "test-only" } });
  const order = await db.order.create({ data: {
    number: `SERVICES-${id}`, userId: user.id, outletId: "kondapur", checkoutKey: id, cartHash: "test",
    status: "CANCELLED", paymentStatus: "REFUND_PENDING", fulfillment: "pickup", address: "", phone: "", note: "",
    totalPaise: 32000, gstPaise: 1524, workMinutes: 10, expiresAt: new Date(),
  } });
  try {
    const baseline = await serviceReadiness();
    const lease = new Date(Date.now() + 60_000);
    const gateway = await db.gatewayOrder.create({ data: { orderId: order.id, receipt: `private-retry-${id}`,
      providerOrderId: `order_services_${id}`, lastError: "Payment reconciliation needs retry or operator review", nextCheckAt: old, leaseUntil: lease } });
    const payment = await db.payment.create({ data: { orderId: order.id, attemptKey: `private-attempt-${id}`, method: "UPI",
      provider: "razorpay", status: "REFUND_PENDING", amountPaise: 32000, refundNextAttemptAt: old, refundLeaseUntil: lease } });
    const message = await db.message.create({ data: { orderId: order.id, kind: "SERVICES_TEST", body: "Test update",
      deliveries: { create: { channel: "EMAIL", provider: "ses", status: "PENDING", createdAt: old } } } });
    const leased = await serviceReadiness();
    expect(leased.queueTiming.refundOverdueSince).toBe(baseline.queueTiming.refundOverdueSince);
    expect(leased.queueTiming.paymentOverdueSince).toBe(baseline.queueTiming.paymentOverdueSince);
    expect(leased.queueTiming.oldestNotificationAt).toBe(old.toISOString());
    expect(leased.queues.queuedNotifications).toBe(baseline.queues.queuedNotifications + 1);
    expect(leased.recoveryIssues.find(row => row.id === gateway.id)).toMatchObject({
      providerOrderId: gateway.providerOrderId, order: { id: order.id, number: order.number }, testMode: true,
    });
    expect(JSON.stringify(leased)).not.toContain(gateway.receipt);
    expect(JSON.stringify(leased)).not.toContain(payment.attemptKey);
    await db.gatewayOrder.update({ where: { id: gateway.id }, data: { leaseUntil: null } });
    await db.payment.update({ where: { id: payment.id }, data: { refundLeaseUntil: null } });
    const overdue = await serviceReadiness();
    expect(overdue.queueTiming.refundOverdueSince).toBe(old.toISOString());
    expect(overdue.queueTiming.paymentOverdueSince).toBe(old.toISOString());
    await db.payment.update({ where: { id: payment.id }, data: { refundReviewRequired: true } });
    expect((await serviceReadiness()).queueTiming.refundOverdueSince).toBe(baseline.queueTiming.refundOverdueSince);
    await db.payment.update({ where: { id: payment.id }, data: { refundReviewRequired: false, providerRefundedPaise: 1000 } });
    expect((await serviceReadiness()).queueTiming.refundOverdueSince).toBe(baseline.queueTiming.refundOverdueSince);
    await db.messageDelivery.updateMany({ where: { messageId: message.id }, data: { status: "ACCEPTED" } });
    expect((await serviceReadiness()).queueTiming.oldestNotificationAt).toBe(baseline.queueTiming.oldestNotificationAt);
  } finally {
    await db.order.delete({ where: { id: order.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
