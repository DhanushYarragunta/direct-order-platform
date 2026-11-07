import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { CommunicationError, communicationCapabilities, emailProvider, smsProvider, sendEmail, sendSms } from "./communications";

export function notificationDeliveries() {
  const capabilities = communicationCapabilities();
  return (["EMAIL", "SMS"] as const).flatMap((channel) => {
    const state = channel === "EMAIL" ? capabilities.transactionalEmail : capabilities.transactionalSms;
    return state === "disabled" ? [] : [{ channel, provider: state === "simulated" ? "demo" : channel === "EMAIL" ? emailProvider() : smsProvider(), status: state === "simulated" ? "SIMULATED" : "PENDING" }];
  });
}
export function notificationRecipient(channel: string, user: { email: string; phone: string | null; emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null; deletedAt: Date | null; role: string }, createdAt: Date) {
  if (user.deletedAt || user.role !== "CUSTOMER") return null;
  if (channel === "EMAIL" && user.emailVerifiedAt && user.emailVerifiedAt <= createdAt && !/\.(invalid|example)$/.test(user.email)) return user.email;
  if (channel === "SMS" && user.phoneVerifiedAt && user.phoneVerifiedAt <= createdAt && user.phone && /^[6-9]\d{9}$/.test(user.phone)) return user.phone;
  return null;
}
export function notificationFailure(error: unknown, attempts: number) {
  if (error instanceof CommunicationError) {
    if (error.retryable && attempts < 5) return { status: "PENDING", lastErrorCode: error.code };
    return { status: error.uncertain ? "UNKNOWN" : "FAILED", lastErrorCode: error.code };
  }
  return { status: "FAILED", lastErrorCode: "PROVIDER_CONFIGURATION" };
}
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
export function notificationStatus(kind: string, testMode = false) {
  const label = kind.startsWith("REFUND_PENDING_") ? "Refund pending"
    : kind.startsWith("REFUNDED_") ? "Refund processed"
    : kind.startsWith("OVERRIDE_") ? "Preparation time updated"
    : ({ PLACED: "Order confirmed", PREPARING: "Preparing", READY: "Ready for pickup", HANDED_OFF: "Handed over",
    OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", REFUND: "Refund processed", LATE: "Preparation delayed",
  } as Record<string, string>)[kind] || "Order updated";
  return testMode ? `Test ${label}` : label;
}

async function claimNotification() {
  return db.$transaction(async (tx) => {
    const selected = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "MessageDelivery"
      WHERE "status"='PENDING' AND "nextAttemptAt"<=NOW()
      ORDER BY "nextAttemptAt" ASC FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!selected.length) return null;
    const record = await tx.messageDelivery.findUniqueOrThrow({ where: { id: selected[0].id }, include: { message: { include: { order: { include: { user: true } } } } } });
    const recipient = notificationRecipient(record.channel, record.message.order.user, record.message.createdAt);
    return tx.messageDelivery.update({ where: { id: record.id }, data: {
      status: "IN_FLIGHT", leaseToken: randomUUID(), leasedUntil: new Date(Date.now() + 60_000),
      firstAttemptAt: record.firstAttemptAt || new Date(), attempts: { increment: 1 },
      recipientHash: record.recipientHash || (recipient ? hash(recipient) : null),
    } });
  });
}

export async function runNotificationJobs() {
  // A demo process must never dispatch an old live outbox after a mode switch.
  if (process.env.DEMO_MODE === "true") return;
  const now = new Date(), cutoff = new Date(now.getTime() - 23 * 60 * 60_000);
  // Resend deduplicates identical requests for 24 hours. SMS has no equivalent
  // guarantee, so a lost response/crashed sender needs review, not another send.
  await db.messageDelivery.updateMany({ where: { status: "IN_FLIGHT", leasedUntil: { lt: now }, OR: [{ provider: { not: "resend" } }, { firstAttemptAt: { lt: cutoff } }, { attempts: { gte: 5 } }] },
    data: { status: "UNKNOWN", lastErrorCode: "LEASE_EXPIRED_UNCERTAIN", leaseToken: null, leasedUntil: null } });
  await db.messageDelivery.updateMany({ where: { status: "IN_FLIGHT", provider: "resend", channel: "EMAIL", leasedUntil: { lt: now }, firstAttemptAt: { gte: cutoff }, attempts: { lt: 5 } },
    data: { status: "PENDING", leaseToken: null, leasedUntil: null } });
  for (let count = 0; count < 10; count++) {
    const claimed = await claimNotification();
    if (!claimed) return;
    const owner = await db.messageDelivery.findUnique({ where: { id: claimed.id }, select: { message: { select: { order: { select: { userId: true } } } } } });
    if (!owner) continue;
    // This transaction is intentionally not retried. Holding the customer lock
    // until the bounded provider request finishes serializes it with erasure.
    // A process/commit failure leaves the lease for conservative recovery above.
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${owner.message.order.userId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "MessageDelivery" WHERE "id"=${claimed.id} FOR UPDATE`;
      const delivery = await tx.messageDelivery.findUnique({ where: { id: claimed.id }, include: { message: { include: { order: { include: { user: true, gatewayOrder: { select: { testMode: true } },
        payments: { where: { provider: "razorpay", status: { in: ["PAID", "REFUND_PENDING", "REFUNDED"] } }, select: { testMode: true }, orderBy: { createdAt: "desc" }, take: 1 },
      } } } } } });
      if (!delivery || delivery.status !== "IN_FLIGHT" || delivery.leaseToken !== claimed.leaseToken) return;
      const finish = (data: { status: string; lastErrorCode?: string | null; providerId?: string; nextAttemptAt?: Date; recipientHash?: string }) =>
        tx.messageDelivery.update({ where: { id: delivery.id }, data: { ...data, leaseToken: null, leasedUntil: null } });
      const recipient = notificationRecipient(delivery.channel, delivery.message.order.user, delivery.message.createdAt);
      if (!recipient) { await finish({ status: "SKIPPED", lastErrorCode: "CONTACT_NOT_VERIFIED" }); return; }
      const recipientHash = hash(recipient);
      if (delivery.recipientHash && delivery.recipientHash !== recipientHash) { await finish({ status: "CANCELLED", lastErrorCode: "CONTACT_CHANGED" }); return; }
      if (delivery.firstAttemptAt && delivery.firstAttemptAt < cutoff) { await finish({ status: "UNKNOWN", lastErrorCode: "RETRY_WINDOW_EXPIRED" }); return; }
      const caps = communicationCapabilities();
      if (delivery.provider !== (delivery.channel === "EMAIL" ? emailProvider() : smsProvider())) {
        await finish({ status: "CANCELLED", lastErrorCode: "PROVIDER_CHANGED" }); return;
      }
      if ((delivery.channel === "EMAIL" ? caps.transactionalEmail : caps.transactionalSms) !== "configured") {
        await finish({ status: "CANCELLED", lastErrorCode: "CHANNEL_DISABLED" }); return;
      }
      await tx.messageDelivery.update({ where: { id: delivery.id }, data: { recipientHash } });
      const order = delivery.message.order;
      const testMode = order.gatewayOrder?.testMode ?? order.payments[0]?.testMode ?? false;
      const origin = process.env.APP_ORIGIN || "";
      const orderLink = origin.startsWith("https://") ? `${origin}/orders/${encodeURIComponent(order.id)}` : "";
      const message = `${testMode ? "Test order. " : ""}${delivery.message.body}`;
      const subject = `${testMode ? "Test order update" : "Order update"} · ${order.number}`;
      const content = `${testMode ? "Test order · " : ""}Deccan Kitchen · ${order.number}\n${testMode ? "This order used a test payment. No real payment was collected.\n" : ""}${delivery.message.body}${orderLink ? `\nView your order and receipt: ${orderLink}` : ""}`;
      try {
        const providerId = delivery.channel === "EMAIL"
          ? await sendEmail(recipient, subject, content, `order-message/${delivery.id}`)
          : await sendSms(recipient, content, { purpose: "update", orderNumber: order.number, orderId: order.id, status: notificationStatus(delivery.message.kind, testMode), message, orderUrl: orderLink });
        await finish({ status: "ACCEPTED", providerId, lastErrorCode: null });
      } catch (error) {
        await finish({ ...notificationFailure(error, delivery.attempts), nextAttemptAt: new Date(Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** delivery.attempts)) });
      }
    }, { timeout: 15_000, maxWait: 5000 });
  }
}
