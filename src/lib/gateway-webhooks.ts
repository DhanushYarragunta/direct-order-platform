import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./auth";
import { razorpayConfigured, razorpayTestMode } from "./razorpay";

const paymentEvents = ["payment.authorized", "payment.captured", "payment.failed", "order.paid"];
const refundEvents = ["refund.created", "refund.processed", "refund.failed"];
const identifier = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`)).max(100);
const eventSchema = z.object({
  event: z.string().max(80),
  payload: z.object({
    payment: z.object({ entity: z.object({ id: identifier("pay") }) }).optional(),
    refund: z.object({ entity: z.object({ id: identifier("rfnd"), payment_id: identifier("pay") }) }).optional(),
  }),
});
export type GatewayWebhookEvent = z.infer<typeof eventSchema>;
export const GATEWAY_WEBHOOK_MAX_ATTEMPTS = 8;
export const GATEWAY_WEBHOOK_LEASE_MS = 300_000;
const ACKNOWLEDGEMENT_TIMEOUT_MS = 3000;

export function gatewayWebhookRecord(input: GatewayWebhookEvent, testMode: boolean) {
  const parsed = eventSchema.parse(input);
  const paymentEvent = paymentEvents.includes(parsed.event), refundEvent = refundEvents.includes(parsed.event);
  if (!paymentEvent && !refundEvent) return null;
  const paymentId = paymentEvent ? parsed.payload.payment?.entity.id : undefined;
  const refund = refundEvent ? parsed.payload.refund?.entity : undefined;
  if ((paymentEvent && !paymentId) || (refundEvent && !refund))
    throw new AppError(400, "The payment webhook is missing its event reference");
  // Only verified, canonical event references participate in deduplication.
  // An unsigned x-razorpay-event-id header cannot poison another event's key.
  const record = { event: parsed.event, paymentId: paymentId || null, refundId: refund?.id || null,
    refundPaymentId: refund?.payment_id || null, testMode };
  return { ...record, dedupeKey: createHash("sha256").update(JSON.stringify(record)).digest("hex") };
}

/** Call only after readRazorpayWebhook has authenticated the original bytes.
 * Provider calls never run on the acknowledgement path. A timed-out insert may
 * finish later; returning 503 lets the provider safely retry the same key. */
export async function enqueueGatewayWebhook(input: GatewayWebhookEvent) {
  const record = gatewayWebhookRecord(input, razorpayTestMode());
  if (!record) return { received: true, ignored: true };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.gatewayWebhook.createMany({ data: record, skipDuplicates: true }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AppError(503, "Payment event storage is temporarily unavailable")), ACKNOWLEDGEMENT_TIMEOUT_MS);
      }),
    ]);
    return { received: true };
  } finally { clearTimeout(timeout); }
}

function eventFromRecord(record: { event: string; paymentId: string | null; refundId: string | null; refundPaymentId: string | null }): GatewayWebhookEvent {
  const event: GatewayWebhookEvent = { event: record.event, payload: {
    ...(record.paymentId ? { payment: { entity: { id: record.paymentId } } } : {}),
    ...(record.refundId && record.refundPaymentId ? { refund: { entity: { id: record.refundId, payment_id: record.refundPaymentId } } } : {}),
  } };
  if (!gatewayWebhookRecord(event, true)) throw new Error("Unsupported stored payment event");
  return event;
}

async function claimGatewayWebhook(testMode: boolean) {
  return db.$transaction(async (tx) => {
    // Prisma stores UTC in timestamp-without-time-zone columns. NOW() is a
    // timestamptz and would shift this comparison in non-UTC database sessions.
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "GatewayWebhook"
      WHERE "status" = 'PENDING' AND "testMode" = ${testMode}
        AND "nextAttemptAt" <= ${new Date()}::timestamp AND "attempts" < ${GATEWAY_WEBHOOK_MAX_ATTEMPTS}
      ORDER BY "nextAttemptAt", "receivedAt", "id"
      FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    return tx.gatewayWebhook.update({ where: { id: rows[0].id }, data: {
      status: "IN_FLIGHT", attempts: { increment: 1 }, leaseToken: randomUUID(),
      leasedUntil: new Date(Date.now() + GATEWAY_WEBHOOK_LEASE_MS), lastErrorCode: null,
    } });
  });
}

/** Processing is at-least-once: the supplied handler must keep its existing
 * transactional idempotency because a process can stop after settlement but
 * before marking the inbox row processed. Only the current lease may finish. */
export async function runGatewayWebhookJobs(handle: (event: GatewayWebhookEvent) => Promise<unknown>) {
  if (!razorpayConfigured()) return;
  const now = new Date(), testMode = razorpayTestMode();
  const expired = { status: "IN_FLIGHT", leasedUntil: { lt: now } };
  await db.gatewayWebhook.updateMany({ where: { ...expired, attempts: { gte: GATEWAY_WEBHOOK_MAX_ATTEMPTS } },
    data: { status: "FAILED", leaseToken: null, leasedUntil: null, lastErrorCode: "RETRY_LIMIT_REACHED" } });
  await db.gatewayWebhook.updateMany({ where: { ...expired, attempts: { lt: GATEWAY_WEBHOOK_MAX_ATTEMPTS } },
    data: { status: "PENDING", leaseToken: null, leasedUntil: null, nextAttemptAt: now, lastErrorCode: "LEASE_EXPIRED" } });
  // Mode changes must neither spend retries nor silently discard old events.
  await db.gatewayWebhook.updateMany({ where: { status: { in: ["PENDING", "BLOCKED"] }, testMode: !testMode },
    data: { status: "BLOCKED", lastErrorCode: "GATEWAY_MODE_CHANGED" } });
  await db.gatewayWebhook.updateMany({ where: { status: "BLOCKED", testMode },
    data: { status: "PENDING", nextAttemptAt: now, lastErrorCode: null } });
  for (let count = 0; count < 5; count++) {
    const record = await claimGatewayWebhook(testMode);
    if (!record) break;
    try {
      await handle(eventFromRecord(record));
      await db.gatewayWebhook.updateMany({ where: { id: record.id, status: "IN_FLIGHT", leaseToken: record.leaseToken },
        data: { status: "PROCESSED", processedAt: new Date(), leaseToken: null, leasedUntil: null, lastErrorCode: null } });
    } catch {
      const failed = record.attempts >= GATEWAY_WEBHOOK_MAX_ATTEMPTS;
      await db.gatewayWebhook.updateMany({ where: { id: record.id, status: "IN_FLIGHT", leaseToken: record.leaseToken },
        data: { status: failed ? "FAILED" : "PENDING", leaseToken: null, leasedUntil: null,
          lastErrorCode: failed ? "RETRY_LIMIT_REACHED" : "PROVIDER_RECONCILIATION_FAILED",
          nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** (record.attempts - 1)) * 1000) } });
    }
  }
}
