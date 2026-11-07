import { z } from "zod";
import { db, serializable } from "./db";
import { AppError, type AuthUser } from "./auth";
import { lockOrder, settlePayment } from "./orders";
import { lockRewards, releaseRewards } from "./rewards";
import { notificationDeliveries } from "./notifications";
import { runGatewayWebhookJobs } from "./gateway-webhooks";
import {
  assertGatewayOrder, createOrRecoverRazorpayOrder, fetchRazorpayOrder, findRazorpayOrderByReceipt,
  fetchRazorpayOrderPayments, fetchRazorpayPayment, fetchRazorpayRefund, fetchRazorpayPaymentRefunds,
  gatewayVerifySchema, paymentProvider, razorpayConfigured, razorpayKeys, razorpayTestMode,
  refundRazorpayPayment, refundFailureDetail, validRazorpaySignature,
  type RazorpayPayment, type RazorpayRefund,
} from "./razorpay";

const leaseMs = 45_000;
const after = (ms: number) => new Date(Date.now() + ms);
const modeError = "Payment belongs to another gateway mode; restore the matching test or live credentials to reconcile it";

async function requireMatchingMode(orderId: string, testMode: boolean) {
  if (testMode === razorpayTestMode()) return;
  await db.gatewayOrder.updateMany({ where: { orderId }, data: { lastError: modeError, nextCheckAt: after(3600_000) } });
  throw new AppError(409, modeError);
}

async function ensureGatewayOrder(orderId: string) {
  const intent = await db.gatewayOrder.findUniqueOrThrow({ where: { orderId }, include: { order: true } });
  await requireMatchingMode(orderId, intent.testMode);
  if (intent.providerOrderId) return intent.providerOrderId;
  const leaseUntil = after(leaseMs);
  const claimed = await db.gatewayOrder.updateMany({
    where: { id: intent.id, providerOrderId: null, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
    data: { leaseUntil },
  });
  if (!claimed.count) throw new AppError(409, "The secure payment session is being prepared. Please retry in a moment.");
  try {
    const closed = intent.order.status !== "PENDING_PAYMENT" || intent.order.expiresAt <= new Date();
    // Closed checkouts can recover an order created before a crash, but must not
    // create fresh payable provider orders during background maintenance.
    const remote = closed ? await findRazorpayOrderByReceipt(intent.receipt)
      : await createOrRecoverRazorpayOrder(intent.receipt, intent.order.totalPaise);
    if (!remote) {
      await db.gatewayOrder.updateMany({ where: { id: intent.id, leaseUntil }, data: {
        leaseUntil: null, nextCheckAt: after(86_400_000),
      } });
      return null;
    }
    assertGatewayOrder(remote, intent.receipt, intent.order.totalPaise);
    await db.gatewayOrder.update({ where: { id: intent.id }, data: {
      providerOrderId: remote.id, leaseUntil: null, nextCheckAt: after(15_000),
    } });
    return remote.id;
  } catch (error) {
    // Never delete this intent or invent a fresh receipt on a timeout: a remote
    // order may already exist. A later request/worker recovers the same receipt.
    await db.gatewayOrder.updateMany({ where: { id: intent.id, leaseUntil }, data: {
      leaseUntil: null, lastError: "Payment session creation needs retry", nextCheckAt: after(30_000),
    } });
    throw error;
  }
}

export async function initiateGatewayPayment(id: string, user: AuthUser) {
  if (paymentProvider() !== "razorpay") throw new AppError(503, "Online payments are not enabled");
  const { keyId } = razorpayKeys();
  const testMode = razorpayTestMode();
  const order = await serializable(async (tx) => {
    const order = await lockOrder(tx, id);
    if (order.userId !== user.id) throw new AppError(404, "Order not found");
    if ((await tx.user.findUnique({ where: { id: user.id }, select: { deletedAt: true } }))?.deletedAt)
      throw new AppError(401, "This account is no longer available");
    if (order.status !== "PENDING_PAYMENT" || order.expiresAt <= new Date())
      throw new AppError(409, "This checkout is closed. Refresh to view its payment status.");
    if (order.totalPaise < 100) throw new AppError(409, "Online payments require a total of at least INR 1");
    await tx.gatewayOrder.upsert({ where: { orderId: id }, update: {}, create: {
      orderId: id, receipt: `web_${order.id}`, testMode,
    } });
    return order;
  });
  const providerOrderId = await ensureGatewayOrder(id);
  // A checkout can expire while the provider responds. Do not open another
  // payment window then; webhooks still refund any late capture safely.
  const current = await db.order.findUniqueOrThrow({ where: { id } });
  if (!providerOrderId || current.status !== "PENDING_PAYMENT" || current.expiresAt <= new Date())
    throw new AppError(409, "This checkout is closed. Refresh to view its payment status.");
  return { provider: "razorpay" as const, keyId, providerOrderId, amount: order.totalPaise,
    currency: "INR" as const, name: "Deccan Kitchen & Co.", description: order.number };
}

async function findPaymentIntent(remote: RazorpayPayment) {
  if (!remote.order_id) return null;
  let intent = await db.gatewayOrder.findUnique({ where: { providerOrderId: remote.order_id }, include: { order: true } });
  if (!intent) {
    // Handles a webhook racing the database write after remote order creation.
    const remoteOrder = await fetchRazorpayOrder(remote.order_id);
    intent = await db.gatewayOrder.findUnique({ where: { receipt: remoteOrder.receipt }, include: { order: true } });
    if (!intent) return null; // Other products may share the merchant account.
    await requireMatchingMode(intent.orderId, intent.testMode);
    assertGatewayOrder(remoteOrder, intent.receipt, intent.order.totalPaise);
    if (intent.providerOrderId && intent.providerOrderId !== remote.order_id)
      throw new AppError(409, "Payment order reference mismatch");
    await db.gatewayOrder.update({ where: { id: intent.id }, data: { providerOrderId: remote.order_id } });
  }
  if (remote.amount !== intent.order.totalPaise || remote.currency !== "INR")
    throw new AppError(409, "Payment amount or currency does not match the order");
  await requireMatchingMode(intent.orderId, intent.testMode);
  return intent;
}

export async function applyGatewayPayment(remote: RazorpayPayment, expectedOrderId?: string) {
  const intent = await findPaymentIntent(remote);
  if (!intent) {
    if (expectedOrderId) throw new AppError(404, "Payment does not belong to this checkout");
    return null;
  }
  if (expectedOrderId && intent.orderId !== expectedOrderId) throw new AppError(404, "Payment does not belong to this checkout");
  return serializable(async (tx) => {
    const order = await lockOrder(tx, intent.orderId);
    let payment = await tx.payment.findUnique({ where: { providerPaymentId: remote.id } });
    if (payment && payment.orderId !== order.id) throw new AppError(409, "Payment is already associated with another order");
    // Aggregate amount_refunded may include refunds that are still pending.
    // Only a processed refund entity (or verified processed sum) is final.
    if (payment?.status === "REFUNDED") return order;
    if (remote.amount_refunded > 0) {
      const partial = remote.amount_refunded !== remote.amount;
      const previousAmount = payment?.providerRefundedPaise || 0;
      const review = partial || payment?.refundReviewRequired === true;
      const status = partial && payment?.status === "PAID" ? "PAID" : "REFUND_PENDING";
      payment = await tx.payment.upsert({ where: { providerPaymentId: remote.id },
        create: { orderId: order.id, attemptKey: remote.id, provider: "razorpay", providerPaymentId: remote.id,
          method: remote.method.toUpperCase(), amountPaise: remote.amount, status, testMode: intent.testMode,
          refundReviewRequired: review, providerRefundedPaise: remote.amount_refunded, refundNextAttemptAt: after(60_000) },
        update: { status, refundReviewRequired: review,
          providerRefundedPaise: Math.max(previousAmount, remote.amount_refunded), refundNextAttemptAt: after(60_000) },
      });
      if (review) {
        const detail = `Payment ${remote.id} reports an external refund amount of INR ${(remote.amount_refunded / 100).toFixed(2)}. A full processed refund must be verified before its receipt can be issued.`;
        await tx.gatewayOrder.updateMany({ where: { orderId: order.id }, data: { lastError: "External refund requires operator review" } });
        if (!await tx.audit.findFirst({ where: { orderId: order.id, action: "REFUND_NEEDS_REVIEW", detail } }))
          await tx.audit.create({ data: { orderId: order.id, action: "REFUND_NEEDS_REVIEW", detail } });
      }
      if (order.status === "PENDING_PAYMENT") {
        await lockRewards(tx, order.userId);
        await releaseRewards(tx, order);
      }
      const anotherPaid = await tx.payment.count({ where: { orderId: order.id, status: "PAID", id: { not: payment.id } } });
      return tx.order.update({ where: { id: order.id }, data: {
        ...(order.status === "PENDING_PAYMENT" ? { status: "CANCELLED" } : {}),
        ...(!anotherPaid && (status === "REFUND_PENDING" || order.status === "PENDING_PAYMENT") ? { paymentStatus: "REFUND_PENDING" } : {}),
        version: { increment: 1 },
      } });
    }
    // A zero/stale aggregate can never dismiss a previously observed refund.
    if (payment && ["PAID", "REFUND_PENDING"].includes(payment.status)) return order;
    const captured = remote.status === "captured" && remote.captured;
    if (!captured && !["created", "authorized", "failed"].includes(remote.status)) return order;
    const status = remote.status === "failed" ? "FAILED" : "PENDING";
    payment = await tx.payment.upsert({ where: { providerPaymentId: remote.id },
      create: { orderId: order.id, attemptKey: remote.id, provider: "razorpay", providerPaymentId: remote.id,
        method: remote.method.toUpperCase(), amountPaise: remote.amount, status, testMode: intent.testMode },
      update: { status, method: remote.method.toUpperCase() },
    });
    if (captured) return settlePayment(tx, order.id, payment.id);
    if (order.status !== "PENDING_PAYMENT") return order;
    const nextStatus = remote.status === "failed" ? "FAILED" : "PENDING";
    if (order.paymentStatus === nextStatus) return order;
    return tx.order.update({ where: { id: order.id }, data: { paymentStatus: nextStatus, version: { increment: 1 } } });
  });
}

export async function verifyGatewayPayment(id: string, input: z.infer<typeof gatewayVerifySchema>, user: AuthUser) {
  const order = await db.order.findUnique({ where: { id }, include: { gatewayOrder: true } });
  if (!order || order.userId !== user.id) throw new AppError(404, "Order not found");
  const providerOrderId = order.gatewayOrder?.providerOrderId;
  if (!providerOrderId || providerOrderId !== input.razorpay_order_id)
    throw new AppError(400, "Payment does not belong to this checkout");
  await requireMatchingMode(id, order.gatewayOrder!.testMode);
  const { keySecret } = razorpayKeys();
  if (!validRazorpaySignature(`${providerOrderId}|${input.razorpay_payment_id}`, input.razorpay_signature, keySecret))
    throw new AppError(400, "Payment verification failed");
  const remote = await fetchRazorpayPayment(input.razorpay_payment_id);
  const result = await applyGatewayPayment(remote, id);
  if (remote.amount_refunded > 0) {
    await reconcileGatewayRefunds(remote.id);
    return db.order.findUniqueOrThrow({ where: { id } });
  }
  return result;
}

async function confirmFullGatewayRefund(paymentId: string, providerRefundId?: string) {
  await serializable(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const order = await lockOrder(tx, payment.orderId);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (current.status === "REFUNDED" && !current.refundReviewRequired && current.providerRefundedPaise === current.amountPaise
      && (!providerRefundId || current.providerRefundId)) return;
    await tx.payment.update({ where: { id: current.id }, data: {
      status: "REFUNDED", refundReviewRequired: false, providerRefundedPaise: current.amountPaise,
      ...(providerRefundId ? { providerRefundId } : {}), refundLeaseUntil: null, refundNextAttemptAt: null,
    } });
    await tx.message.upsert({ where: { orderId_kind: { orderId: order.id, kind: `REFUNDED_${current.id}` } },
      create: { orderId: order.id, kind: `REFUNDED_${current.id}`,
        body: "Your full refund has been processed by the payment provider. Your bank may take additional time to show it.",
        deliveries: { create: notificationDeliveries() } }, update: {} });
    const remaining = await tx.payment.count({ where: { orderId: order.id, status: { in: ["PAID", "REFUND_PENDING"] } } });
    if (!remaining && order.status === "PENDING_PAYMENT") {
      await lockRewards(tx, order.userId);
      await releaseRewards(tx, order);
    }
    await tx.order.update({ where: { id: order.id }, data: {
      ...(!remaining ? { paymentStatus: "REFUNDED", ...(order.status === "PENDING_PAYMENT" ? { status: "CANCELLED" } : {}) } : {}),
      version: { increment: 1 },
    } });
    const reviewRemaining = await tx.payment.count({ where: { orderId: order.id, refundReviewRequired: true } });
    const pendingRefunds = await tx.payment.count({ where: { orderId: order.id, status: "REFUND_PENDING" } });
    // An order can have multiple captures. Confirming one refund does not
    // resolve a different capture's rejected or delayed refund.
    if (reviewRemaining || !pendingRefunds) await tx.gatewayOrder.updateMany({ where: { orderId: order.id }, data: {
      lastError: reviewRemaining ? "External refund requires operator review" : null,
    } });
  });
}

export async function applyGatewayRefund(remote: RazorpayRefund) {
  const payment = await db.payment.findUnique({ where: { providerPaymentId: remote.payment_id } });
  if (!payment || payment.provider !== "razorpay") return;
  await requireMatchingMode(payment.orderId, payment.testMode);
  if (remote.currency !== "INR" || remote.amount <= 0 || remote.amount > payment.amountPaise)
    throw new AppError(409, "Refund amount does not match the payment; operator review is required");
  if (remote.amount === payment.amountPaise && remote.status === "processed") {
    await confirmFullGatewayRefund(payment.id, remote.id);
    return;
  }
  await serializable(async (tx) => {
    const order = await lockOrder(tx, payment.orderId);
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status === "REFUNDED") return;
    const partial = remote.amount < current.amountPaise;
    const mismatchedId = !!current.providerRefundId && current.providerRefundId !== remote.id;
    const review = partial || remote.status === "failed" || mismatchedId || current.refundReviewRequired;
    await tx.payment.update({ where: { id: current.id }, data: {
      ...(!partial && !mismatchedId ? { providerRefundId: remote.id } : {}),
      status: partial && current.status === "PAID" ? "PAID" : "REFUND_PENDING",
      refundReviewRequired: review,
      providerRefundedPaise: remote.status === "failed" ? current.providerRefundedPaise : Math.max(current.providerRefundedPaise, remote.amount),
      refundLeaseUntil: null, refundNextAttemptAt: review ? null : after(60_000),
    } });
    if (review) {
      const detail = `Provider refund ${remote.id} (${remote.status}, INR ${(remote.amount / 100).toFixed(2)}) needs review. Receipt issuance is held until a full processed refund is verified.`;
      if (!await tx.audit.findFirst({ where: { orderId: order.id, action: "REFUND_NEEDS_REVIEW", detail } }))
        await tx.audit.create({ data: { orderId: order.id, action: "REFUND_NEEDS_REVIEW", detail } });
      await tx.gatewayOrder.updateMany({ where: { orderId: order.id }, data: { lastError: "External refund requires operator review" } });
    }
    if (order.status === "PENDING_PAYMENT") {
      await lockRewards(tx, order.userId);
      await releaseRewards(tx, order);
    }
    const anotherPaid = await tx.payment.count({ where: { orderId: order.id, status: "PAID", id: { not: current.id } } });
    await tx.order.update({ where: { id: order.id }, data: {
      ...(order.status === "PENDING_PAYMENT" ? { status: "CANCELLED" } : {}),
      ...(!anotherPaid && !partial ? { paymentStatus: "REFUND_PENDING" } : {}), version: { increment: 1 },
    } });
  });
}

export async function reconcileGatewayRefunds(providerPaymentId: string) {
  const payment = await db.payment.findUnique({ where: { providerPaymentId } });
  if (!payment || payment.provider !== "razorpay" || payment.status === "REFUNDED") return;
  await requireMatchingMode(payment.orderId, payment.testMode);
  const fetched = await fetchRazorpayPaymentRefunds(providerPaymentId);
  const refunds = [...new Map(fetched.map((refund) => [refund.id, refund])).values()];
  if (!refunds.length) throw new AppError(409, "The provider has not yet exposed the refund status");
  if (refunds.some((refund) => refund.payment_id !== providerPaymentId || refund.currency !== "INR"))
    throw new AppError(409, "Refund references do not match the payment");
  const processed = refunds.filter((refund) => refund.status === "processed");
  const processedAmount = processed.reduce((sum, refund) => sum + refund.amount, 0);
  if (processedAmount === payment.amountPaise) {
    await confirmFullGatewayRefund(payment.id, processed.length === 1 ? processed[0].id : undefined);
    return;
  }
  if (processedAmount > payment.amountPaise) throw new AppError(409, "Refund totals require operator review");
  for (const refund of refunds) await applyGatewayRefund(refund);
}

export async function processGatewayRefund(paymentId: string) {
  const stored = await db.payment.findUnique({ where: { id: paymentId } });
  if (!stored || stored.provider !== "razorpay" || stored.status !== "REFUND_PENDING") return;
  if (stored.testMode !== razorpayTestMode()) {
    await db.gatewayOrder.updateMany({ where: { orderId: stored.orderId }, data: { lastError: modeError, nextCheckAt: after(3600_000) } });
    await db.payment.updateMany({ where: { id: paymentId, testMode: stored.testMode }, data: { refundNextAttemptAt: after(3600_000) } });
    return;
  }
  const leaseUntil = after(leaseMs);
  const claimed = await db.payment.updateMany({ where: {
    id: paymentId, provider: "razorpay", status: "REFUND_PENDING", refundReviewRequired: false,
    AND: [{ OR: [{ refundLeaseUntil: null }, { refundLeaseUntil: { lt: new Date() } }] },
      { OR: [{ providerRefundedPaise: 0 }, { providerRefundId: { not: null } }] }],
  }, data: { refundLeaseUntil: leaseUntil, refundAttempts: { increment: 1 } } });
  if (!claimed.count) return;
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  try {
    if (!payment.providerPaymentId) throw new Error("Missing payment reference");
    const remote = payment.providerRefundId ? await fetchRazorpayRefund(payment.providerRefundId)
      : await refundRazorpayPayment(payment.providerPaymentId, payment.amountPaise, payment.id);
    await applyGatewayRefund(remote);
  } catch (error) {
    const detail = refundFailureDetail(error);
    await serializable(async (tx) => {
      await lockOrder(tx, payment.orderId);
      const updated = await tx.payment.updateMany({ where: { id: paymentId, refundLeaseUntil: leaseUntil }, data: {
        refundLeaseUntil: null, refundNextAttemptAt: after(Math.min(3600, 30 * 2 ** Math.min(payment.refundAttempts, 7)) * 1000),
      } });
      // A concurrent successful webhook must not acquire a stale failure.
      if (!updated.count) return;
      await tx.gatewayOrder.updateMany({ where: { orderId: payment.orderId }, data: { lastError: detail } });
      if (payment.refundAttempts === 1 || payment.refundAttempts % 10 === 0)
        await tx.audit.create({ data: { orderId: payment.orderId, action: "REFUND_RETRY",
          detail: `${detail} Attempt ${payment.refundAttempts}.` } });
    });
  }
}

export async function handleGatewayWebhook(event: { event: string; payload: {
  payment?: { entity: { id: string } }; refund?: { entity: { id: string; payment_id: string } };
} }) {
  if (["payment.authorized", "payment.captured", "payment.failed", "order.paid"].includes(event.event) && event.payload.payment) {
    const payment = await fetchRazorpayPayment(event.payload.payment.entity.id);
    await applyGatewayPayment(payment);
    if (payment.amount_refunded > 0) await reconcileGatewayRefunds(payment.id);
  } else if (["refund.processed", "refund.failed", "refund.created"].includes(event.event) && event.payload.refund) {
    // The signed payload triggers reconciliation; the API remains authoritative.
    const remotePayment = await fetchRazorpayPayment(event.payload.refund.entity.payment_id);
    await applyGatewayPayment(remotePayment);
    const refund = await fetchRazorpayRefund(event.payload.refund.entity.id);
    await applyGatewayRefund(refund);
    if (refund.amount < remotePayment.amount) await reconcileGatewayRefunds(remotePayment.id);
  }
  return { received: true };
}

export async function runGatewayJobs() {
  if (!razorpayConfigured()) return;
  await runGatewayWebhookJobs(handleGatewayWebhook);
  const now = new Date();
  const refunds = await db.payment.findMany({ where: {
    provider: "razorpay", status: "REFUND_PENDING", refundReviewRequired: false, refundNextAttemptAt: { lte: now },
    AND: [{ OR: [{ refundLeaseUntil: null }, { refundLeaseUntil: { lt: now } }] },
      { OR: [{ providerRefundedPaise: 0 }, { providerRefundId: { not: null } }] }],
  }, orderBy: { refundNextAttemptAt: "asc" }, take: 20, select: { id: true } });
  for (const payment of refunds) await processGatewayRefund(payment.id);
  const intents = await db.gatewayOrder.findMany({ where: {
    nextCheckAt: { lte: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
  }, orderBy: { nextCheckAt: "asc" }, take: 20, include: { order: true } });
  for (const intent of intents) {
    let ownedLease: Date | null = null;
    try {
      await requireMatchingMode(intent.orderId, intent.testMode);
      const providerOrderId = intent.providerOrderId || await ensureGatewayOrder(intent.orderId);
      if (!providerOrderId) continue;
      const leaseUntil = after(leaseMs);
      const claimed = await db.gatewayOrder.updateMany({ where: { id: intent.id,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
      }, data: { leaseUntil } });
      if (!claimed.count) continue;
      ownedLease = leaseUntil;
      const payments = await fetchRazorpayOrderPayments(providerOrderId);
      for (const payment of payments) {
        await applyGatewayPayment(payment, intent.orderId);
        if (payment.amount_refunded > 0) await reconcileGatewayRefunds(payment.id);
      }
      const age = Date.now() - intent.createdAt.getTime();
      // After checkout expiry we continue looking for delayed bank captures.
      // Settled orders are checked daily as well, so missed external refunds are
      // reflected without making webhook delivery the only recovery mechanism.
      const delay = intent.order.status === "PENDING_PAYMENT" ? 15_000 : age < 86_400_000 ? 300_000 : 86_400_000;
      await db.$transaction(async (tx) => {
        // Refund webhooks acquire this same order lock before setting review.
        // A concurrent observation therefore cannot be cleared by a stale read.
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${intent.orderId} FOR UPDATE`;
        const reviewRequired = await tx.payment.count({ where: { orderId: intent.orderId, refundReviewRequired: true } });
        const pendingRefunds = await tx.payment.count({ where: { orderId: intent.orderId, status: "REFUND_PENDING" } });
        await tx.gatewayOrder.updateMany({ where: { id: intent.id, leaseUntil }, data: {
          leaseUntil: null, ...(reviewRequired ? { lastError: "External refund requires operator review" }
            : pendingRefunds ? {} : { lastError: null }), nextCheckAt: after(delay),
        } });
      });
    } catch {
      if (ownedLease) await db.gatewayOrder.updateMany({ where: { id: intent.id, leaseUntil: ownedLease }, data: {
        leaseUntil: null, lastError: "Payment reconciliation needs retry or operator review", nextCheckAt: after(60_000),
      } });
    }
  }
}
