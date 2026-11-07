import { db } from "./db";
import { communicationCapabilities } from "./communications";
import { paymentProvider, razorpayConfigured } from "./razorpay";
import { summarizeWorkers } from "./worker-status";

export async function serviceReadiness() {
  const now = new Date();
  const [refunds, notificationAttention, queuedNotifications, paymentRecovery, unverifiedOutlets, refundReview, paymentIssues, deliveryIssues,
    recoveryIssues, oldestNotification, overdueRefund, overdueRecovery, workerRecords,
    queuedWebhooks, webhookAttention, oldestWebhook, webhookIssues] = await Promise.all([
    db.payment.count({ where: { provider: "razorpay", status: "REFUND_PENDING" } }),
    db.messageDelivery.count({ where: { status: { in: ["UNKNOWN", "FAILED"] } } }),
    db.messageDelivery.count({ where: { status: { in: ["PENDING", "IN_FLIGHT"] } } }),
    db.gatewayOrder.count({ where: { lastError: { not: null } } }),
    db.outlet.count({ where: { open: true, fssaiVerified: false } }),
    db.payment.count({ where: { refundReviewRequired: true } }),
    db.payment.findMany({ where: { OR: [{ refundReviewRequired: true }, { status: "REFUND_PENDING" }] },
      orderBy: { updatedAt: "desc" }, take: 20,
      select: { id: true, status: true, providerPaymentId: true, providerRefundId: true, refundReviewRequired: true,
        order: { select: { id: true, number: true } } } }),
    db.messageDelivery.findMany({ where: { status: { in: ["UNKNOWN", "FAILED"] } }, orderBy: { updatedAt: "desc" }, take: 20,
      select: { id: true, channel: true, status: true, provider: true, providerId: true, lastErrorCode: true,
        attempts: true, updatedAt: true,
        message: { select: { order: { select: { id: true, number: true } } } } } }),
    db.gatewayOrder.findMany({ where: { lastError: { not: null } }, orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }], take: 20,
      select: { id: true, providerOrderId: true, lastError: true, nextCheckAt: true, updatedAt: true, testMode: true,
        order: { select: { id: true, number: true, status: true } } } }),
    db.messageDelivery.aggregate({ where: { status: { in: ["PENDING", "IN_FLIGHT"] } }, _min: { createdAt: true } }),
    db.payment.aggregate({ where: { provider: "razorpay", status: "REFUND_PENDING", refundReviewRequired: false, refundNextAttemptAt: { lte: now },
      AND: [{ OR: [{ refundLeaseUntil: null }, { refundLeaseUntil: { lt: now } }] },
        { OR: [{ providerRefundedPaise: 0 }, { providerRefundId: { not: null } }] }] }, _min: { refundNextAttemptAt: true } }),
    db.gatewayOrder.aggregate({ where: { lastError: { not: null }, nextCheckAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] }, _min: { nextCheckAt: true } }),
    db.workerStatus.findMany({ where: { updatedAt: { gte: new Date(now.getTime() - 7 * 86400_000) } } }),
    db.gatewayWebhook.count({ where: { status: { in: ["PENDING", "IN_FLIGHT"] } } }),
    db.gatewayWebhook.count({ where: { status: { in: ["FAILED", "BLOCKED"] } } }),
    db.gatewayWebhook.aggregate({ where: { status: { in: ["PENDING", "IN_FLIGHT"] } }, _min: { receivedAt: true } }),
    db.gatewayWebhook.findMany({ where: { status: { in: ["FAILED", "BLOCKED"] } },
      orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 20,
      select: { id: true, event: true, status: true, paymentId: true, refundId: true, refundPaymentId: true,
        testMode: true, attempts: true, lastErrorCode: true, receivedAt: true } }),
  ]);
  const provider = paymentProvider(), communications = communicationCapabilities();
  return {
    checkedAt: now.toISOString(),
    demoMode: process.env.DEMO_MODE === "true",
    payment: { provider, configured: provider === "demo" || (provider === "razorpay" && razorpayConfigured()),
      testMode: provider === "demo" || !process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") },
    communications,
    emailProvider: process.env.EMAIL_PROVIDER || "ses",
    smsProvider: process.env.SMS_PROVIDER || "aws",
    business: { support: Boolean(process.env.SUPPORT_EMAIL?.trim()), privacy: Boolean(process.env.PRIVACY_CONTACT?.trim()), unverifiedOutlets },
    queues: { refunds, refundReview, notificationAttention, queuedNotifications, paymentRecovery, queuedWebhooks, webhookAttention },
    workers: summarizeWorkers(workerRecords, now),
    queueTiming: {
      oldestNotificationAt: oldestNotification._min.createdAt?.toISOString() ?? null,
      refundOverdueSince: overdueRefund._min.refundNextAttemptAt?.toISOString() ?? null,
      paymentOverdueSince: overdueRecovery._min.nextCheckAt?.toISOString() ?? null,
      oldestWebhookAt: oldestWebhook._min.receivedAt?.toISOString() ?? null,
    },
    paymentIssues, deliveryIssues, recoveryIssues, webhookIssues,
  };
}
