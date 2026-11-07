import { createHash, randomBytes } from "node:crypto";
import { Prisma, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { db, serializable } from "./db";
import { AppError, AuthUser, staffOutlet } from "./auth";
import {
  cartLineKey,
  canTransition,
  gstIncluded,
  overridePromise,
} from "./domain";
import { checkoutSchema, paymentSchema, quoteSchema } from "./validation";
import { priceCart } from "./pricing";
import { menuForOutlet, menuScheduleOpen } from "./menu-context";
import { lockRewards, quoteRewards, releaseRewards, earnRewards, firstOrderEligible } from "./rewards";
import { deliveryFee, deliveryOutlet, type DeliveryLocation } from "./delivery";
import { validCheckoutStart } from "./checkout-timing";
import { notificationDeliveries } from "./notifications";
import { paymentProvider } from "./razorpay";
import { learnedPreparationEstimate, MAX_PREPARATION_HISTORY, preparationHour, preparationSampleFromOrder,
  type PreparationPrediction, type PreparationSample } from "./preparation-model";
import { demoPrediction, demoPreparationEnabled } from "./preparation-demo";

export async function resolveCheckoutOutlet(tx: Prisma.TransactionClient, input: DeliveryLocation & { outletId: string; fulfillment?: string }) {
  if (input.fulfillment === "delivery") {
    try { return deliveryOutlet(await tx.outlet.findMany(), input); }
    catch (error) { throw new AppError(400, (error as Error).message); }
  }
  const outlet = await tx.outlet.findUnique({ where: { id: input.outletId } });
  if (!outlet?.open) throw new AppError(409, "This kitchen is currently closed");
  return outlet;
}

function livePreparationHistory() {
  return process.env.DEMO_MODE !== "true" && process.env.RAZORPAY_KEY_ID?.startsWith("rzp_live_") === true;
}

function predictionMetadata(estimate: PreparationPrediction) {
  return { estimateModelVersion: estimate.modelVersion, estimateRawMinutes: estimate.rawMinutes,
    estimateTrainingSamples: estimate.trainingSamples, estimateValidationMae: estimate.validationMae,
    estimateBaselineMae: estimate.baselineMae };
}

async function preparationQuote(tx: Prisma.TransactionClient, outlet: { id: string; minPrepMinutes: number; activeStations: number }, workMinutes: number,
  allowLearning = paymentProvider() === "razorpay" && livePreparationHistory()) {
  const now = new Date();
  const queue = await tx.order.aggregate({
    where: { outletId: outlet.id, status: { in: ["PLACED", "PREPARING"] } },
    _sum: { workMinutes: true },
  });
  const inputs = { workMinutes, queueWork: queue._sum.workMinutes || 0, minimum: outlet.minPrepMinutes,
    stations: outlet.activeStations, hour: preparationHour(now) };
  if (!allowLearning && demoPreparationEnabled()) return { ...demoPrediction(inputs), inputs };
  const rows = allowLearning ? await tx.order.findMany({
    where: { outletId: outlet.id, estimateSource: "live", paymentStatus: "PAID", status: { not: "CANCELLED" },
      placedAt: { gte: new Date(now.getTime() - 90 * 86400_000) }, readyAt: { not: null, lte: now } },
    orderBy: { placedAt: "desc" }, take: MAX_PREPARATION_HISTORY,
    select: { workMinutes: true, placedAt: true, readyAt: true, estimateSource: true, estimateQueueWork: true,
      estimateStations: true, estimateMinimumMinutes: true, estimateHour: true },
  }) : [];
  const history = rows.map(preparationSampleFromOrder).filter((sample): sample is PreparationSample => sample !== null);
  return { ...learnedPreparationEstimate(inputs, history, now, allowLearning), inputs };
}

export async function quoteCheckout(tx: Prisma.TransactionClient, input: z.infer<typeof quoteSchema>, userId: string) {
  const outlet = await resolveCheckoutOutlet(tx, input);
  const priced = await priceCheckoutCart(tx, { ...input, outletId: outlet.id });
  const rewards = await quoteRewards(tx, userId, priced.totalPaise, input.couponCode, 0, input.useLoyalty);
  let fee: number;
  try { fee = deliveryFee(priced.totalPaise, input.fulfillment || "pickup", outlet); }
  catch (error) { throw new AppError(409, (error as Error).message); }
  const estimate = await preparationQuote(tx, outlet, priced.workMinutes);
  return {
    ...rewards, totalPaise: rewards.totalPaise + fee, gstPaise: gstIncluded(rewards.totalPaise + fee),
    deliveryFeePaise: fee, fulfillment: input.fulfillment || "pickup", outletId: outlet.id, outletName: outlet.name,
    estimateMinutes: estimate.minutes, estimateFallback: estimate.fallback,
    ...predictionMetadata(estimate),
    quotedAt: new Date().toISOString(), minimumMinutes: outlet.minPrepMinutes,
    minDeliveryPaise: outlet.minDeliveryPaise, freeDeliveryAbovePaise: outlet.freeDeliveryAbovePaise,
  };
}

export async function priceCheckoutCart(
  tx: Prisma.TransactionClient,
  input: { outletId: string; lines: z.infer<typeof checkoutSchema>["lines"] },
) {
  const outlet = await tx.outlet.findUnique({ where: { id: input.outletId } });
  if (!outlet?.open) throw new AppError(409, "This kitchen is currently closed");
  const [items, extras] = await Promise.all([
    tx.menuItem.findMany({
      where: { id: { in: input.lines.map((l) => l.itemId) } },
      include: { cityPrices: true, availability: { where: { outletId: outlet.id } } },
    }),
    tx.addOn.findMany(),
  ]);
  try {
    return priceCart(input.lines, items.map((item) => {
      const effective = menuForOutlet(item, outlet.city);
      return { ...effective, available: item.availability[0]?.available === true && effective.scheduleAvailable };
    }), extras);
  } catch (error) {
    throw new AppError(409, error instanceof Error ? error.message : "The menu changed. Please review your cart.");
  }
}

export const orderInclude = {
  lines: true,
  outlet: true,
  messages: { orderBy: { createdAt: "asc" as const }, include: { deliveries: { select: { channel: true, status: true } } } },
  payments: { orderBy: { createdAt: "desc" as const }, take: 8 },
} satisfies Prisma.OrderInclude;
export async function getOrder(id: string, user: AuthUser) {
  const order = await db.order.findUnique({
    where: { id },
    include: orderInclude,
  });
  if (!order) throw new AppError(404, "Order not found");
  if (user.role === "CUSTOMER" && order.userId !== user.id)
    throw new AppError(404, "Order not found");
  if (user.role !== "CUSTOMER") staffOutlet(user, order.outletId);
  const receiptReviewRequired = await db.payment.count({ where: { orderId: id, refundReviewRequired: true } }) > 0;
  return { ...order, receiptReviewRequired };
}
export async function checkout(
  input: z.infer<typeof checkoutSchema>,
  user: AuthUser,
) {
  const canonical = {
    ...input,
    lines: [...input.lines]
      .map((l) => ({ ...l, addOnIds: [...l.addOnIds].sort() }))
      .sort((a, b) => cartLineKey(a).localeCompare(cartLineKey(b))),
  };
  const cartHash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
  const existing = async () => {
    const order = await db.order.findUnique({
      where: {
        userId_checkoutKey: { userId: user.id, checkoutKey: input.checkoutKey },
      },
    });
    if (order && order.cartHash !== cartHash)
      throw new AppError(
        409,
        "This checkout changed. Please start a new checkout.",
      );
    return order;
  };
  const found = await existing();
  if (found) return found;
  try {
    return await serializable(async (tx) => {
      await lockRewards(tx, user.id);
      if ((await tx.user.findUnique({ where: { id: user.id }, select: { deletedAt: true } }))?.deletedAt)
        throw new AppError(401, "This account has been deleted");
      const repeated = await tx.order.findUnique({ where: {
        userId_checkoutKey: { userId: user.id, checkoutKey: input.checkoutKey },
      } });
      if (repeated) {
        if (repeated.cartHash !== cartHash) throw new AppError(409, "This checkout changed. Please start a new checkout.");
        return repeated;
      }
      const selected = await resolveCheckoutOutlet(tx, input);
      await tx.$queryRaw`SELECT "id" FROM "Outlet" WHERE "id"=${selected.id} FOR UPDATE`;
      const outlet = await tx.outlet.findUnique({
        where: { id: selected.id },
      });
      if (!outlet?.open)
        throw new AppError(409, "This kitchen is currently closed");
      const priced = await priceCheckoutCart(tx, { ...input, outletId: outlet.id });
      const quote = await quoteRewards(tx, user.id, priced.totalPaise, input.couponCode, input.redeemedPoints);
      let fee: number;
      try { fee = deliveryFee(priced.totalPaise, input.fulfillment, outlet); }
      catch (error) { throw new AppError(409, (error as Error).message); }
      const totalPaise = quote.totalPaise + fee;
      if (input.expectedTotalPaise !== undefined && input.expectedTotalPaise !== totalPaise)
        throw new AppError(409, "The price or delivery fee changed. Review the refreshed total before paying.");
      const estimate = await preparationQuote(tx, outlet, priced.workMinutes);
      const checkoutStartedAt = validCheckoutStart(input.checkoutStartedAt);
      const order = await tx.order.create({
        data: {
          number: `WEB-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`,
          userId: user.id,
          outletId: outlet.id,
          checkoutKey: input.checkoutKey,
          cartHash,
          subtotalPaise: priced.totalPaise,
          couponCode: quote.couponCode,
          couponDiscountPaise: quote.couponDiscountPaise,
          redeemedPoints: quote.redeemedPoints,
          totalPaise,
          deliveryFeePaise: fee,
          deliveryLocalityId: input.fulfillment === "delivery" ? input.localityId : null,
          checkoutStartedAt,
          checkoutMetricSource: checkoutStartedAt ? (process.env.DEMO_MODE === "true" ? "demo" : "browser") : null,
          gstPaise: gstIncluded(totalPaise),
          estimateMinutes: estimate.minutes,
          estimateFallback: estimate.fallback,
          ...predictionMetadata(estimate),
          workMinutes: priced.workMinutes,
          fulfillment: input.fulfillment,
          address: input.address,
          phone: input.phone,
          note: input.note,
          expiresAt: new Date(Date.now() + 15 * 60_000),
          lines: { create: priced.lines },
        },
      });
      if (quote.redeemedPoints)
        await tx.loyaltyEntry.create({ data: {
          userId: user.id, orderId: order.id, kind: "REDEEM", points: -quote.redeemedPoints,
        } });
      return order;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const repeated = await existing();
      if (repeated) return repeated;
    }
    throw error;
  }
}

export async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id },
    include: { lines: true, outlet: true },
  });
  if (!order) throw new AppError(404, "Order not found");
  return order;
}

export async function queueGatewayRefund(tx: Prisma.TransactionClient, paymentId: string, reason: string) {
  const payment = await tx.payment.update({ where: { id: paymentId }, data: {
    status: "REFUND_PENDING", refundReason: reason, refundNextAttemptAt: new Date(), resolveAt: null,
  } });
  await tx.message.upsert({
    where: { orderId_kind: { orderId: payment.orderId, kind: `REFUND_PENDING_${payment.id}` } },
    create: { orderId: payment.orderId, kind: `REFUND_PENDING_${payment.id}`,
      body: `${reason} A full refund has been requested. We will update you when the payment provider confirms it.`,
      deliveries: { create: notificationDeliveries() } },
    update: {},
  });
  await tx.order.update({ where: { id: payment.orderId }, data: { version: { increment: 1 } } });
}

export async function settlePayment(
  tx: Prisma.TransactionClient,
  id: string,
  paymentId: string,
) {
  const order = await lockOrder(tx, id);
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.orderId !== id) throw new AppError(409, "Payment does not belong to this order");
  if (payment.status !== "PENDING") return order;
  const gateway = payment.provider === "razorpay";
  await lockRewards(tx, order.userId);
  const deleted = (await tx.user.findUnique({ where: { id: order.userId }, select: { deletedAt: true } }))?.deletedAt;
  if (deleted && !gateway)
    throw new AppError(401, "This account has been deleted");
  if (order.status !== "PENDING_PAYMENT" || order.expiresAt < new Date() || deleted) {
    if (gateway) await queueGatewayRefund(tx, paymentId, "The payment arrived after this checkout closed or was already paid.");
    else await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "FAILED", resolveAt: null },
    });
    if (order.status === "PENDING_PAYMENT") {
      await releaseRewards(tx, order);
      await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          paymentStatus: gateway ? "REFUND_PENDING" : "FAILED",
          version: { increment: 1 },
        },
      });
    } else if (gateway && order.status === "CANCELLED") {
      await tx.order.update({ where: { id }, data: { paymentStatus: "REFUND_PENDING", version: { increment: 1 } } });
    }
    return tx.order.findUniqueOrThrow({ where: { id } });
  }
  await tx.$queryRaw`SELECT "id" FROM "Outlet" WHERE "id"=${order.outletId} FOR UPDATE`;
  const items = await tx.menuItem.findMany({
    where: { id: { in: order.lines.map((l) => l.itemId) } },
    include: { availability: { where: { outletId: order.outletId } } },
  });
  const unavailable =
    !order.outlet.open ||
    order.lines.some(
      (line) =>
        !items.some(
          (i) =>
            i.id === line.itemId && i.active && i.availability[0]?.available && menuScheduleOpen(i),
        ),
    );
  const firstCoupon = order.couponCode ? await tx.coupon.findUnique({ where: { code: order.couponCode } }) : null;
  const welcomeLost = firstCoupon?.firstOrderOnly && !(await firstOrderEligible(tx, order.userId, order.id));
  if (unavailable || welcomeLost) {
    await releaseRewards(tx, order);
    if (gateway) await queueGatewayRefund(tx, paymentId, welcomeLost
      ? "The first-order coupon could no longer be applied, so the order was cancelled."
      : "An item became unavailable, so the order was cancelled before reaching the kitchen.");
    else await tx.payment.update({
      where: { id: paymentId },
      data: { status: "REFUNDED", resolveAt: null },
    });
    if (!gateway) await tx.message.create({
      data: {
        deliveries: { create: notificationDeliveries() },
        orderId: id,
        kind: "REFUND",
        body: welcomeLost
          ? "Your first-order coupon is no longer eligible because another order was paid. Your simulated payment was refunded and reserved points returned."
          : "An item became unavailable. Your simulated payment has been refunded and reserved points returned; no order was sent to the kitchen.",
      },
    });
    return tx.order.update({
      where: { id },
      data: {
        status: "CANCELLED",
        paymentStatus: gateway ? "REFUND_PENDING" : "REFUNDED",
        version: { increment: 1 },
      },
    });
  }
  const realObservation = gateway && !payment.testMode && livePreparationHistory();
  const estimate = await preparationQuote(tx, order.outlet, order.workMinutes, realObservation);
  const promisedAt = new Date(Date.now() + estimate.minutes * 60000);
  await tx.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", resolveAt: null },
  });
  await tx.payment.updateMany({
    where: { orderId: id, id: { not: paymentId }, status: "PENDING" },
    data: { status: "FAILED", resolveAt: null },
  });
  await tx.message.create({
    data: {
      deliveries: { create: notificationDeliveries() },
      orderId: id,
      kind: "PLACED",
      body: `Order confirmed. ${order.outlet.name} is preparing your order, with an estimated preparation time of ${estimate.minutes} minutes.`,
    },
  });
  return tx.order.update({
    where: { id },
    data: {
      status: "PLACED",
      paymentStatus: "PAID",
      placedAt: new Date(),
      checkoutDurationMs: order.checkoutStartedAt ? Math.max(0, Date.now() - order.checkoutStartedAt.getTime()) : null,
      promisedAt,
      originalPromisedAt: promisedAt,
      estimateMinutes: estimate.minutes,
      estimateFallback: estimate.fallback,
      ...predictionMetadata(estimate),
      estimateSource: realObservation ? "live" : "demo",
      estimateQueueWork: estimate.inputs.queueWork,
      estimateStations: estimate.inputs.stations,
      estimateMinimumMinutes: estimate.inputs.minimum,
      estimateHour: estimate.inputs.hour,
      version: { increment: 1 },
    },
  });
}

export async function payOrder(
  id: string,
  input: z.infer<typeof paymentSchema>,
  user: AuthUser,
) {
  if (paymentProvider() !== "demo")
    throw new AppError(403, "The simulated gateway is disabled");
  return serializable(async (tx) => {
    const order = await lockOrder(tx, id);
    if (order.userId !== user.id) throw new AppError(404, "Order not found");
    await lockRewards(tx, user.id);
    if ((await tx.user.findUnique({ where: { id: user.id }, select: { deletedAt: true } }))?.deletedAt)
      throw new AppError(401, "This account has been deleted");
    const existing = await tx.payment.findUnique({
      where: {
        orderId_attemptKey: { orderId: id, attemptKey: input.attemptKey },
      },
    });
    if (
      existing ||
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "REFUNDED"
    )
      return order;
    if (order.status !== "PENDING_PAYMENT" || order.expiresAt < new Date())
      throw new AppError(
        409,
        "This checkout expired. Please place a new order.",
      );
    const pending = await tx.payment.findFirst({
      where: { orderId: id, status: "PENDING" },
    });
    if (pending) return order;
    const payment = await tx.payment.create({
      data: {
        orderId: id,
        attemptKey: input.attemptKey,
        method: input.method,
        amountPaise: order.totalPaise,
        status: input.outcome === "failed" ? "FAILED" : "PENDING",
        resolveAt:
          input.outcome === "pending" ? new Date(Date.now() + 8000) : null,
      },
    });
    if (input.outcome === "success") return settlePayment(tx, id, payment.id);
    return tx.order.update({
      where: { id },
      data: {
        paymentStatus: input.outcome === "failed" ? "FAILED" : "PENDING",
        version: { increment: 1 },
      },
    });
  });
}

export async function advanceOrder(
  id: string,
  status: OrderStatus,
  version: number,
  user: AuthUser,
) {
  return serializable(async (tx) => {
    const order = await lockOrder(tx, id);
    if (user.role === "CUSTOMER") {
      if (order.userId !== user.id) throw new AppError(404, "Order not found");
      if (status !== "CANCELLED" || order.status !== "PLACED")
        throw new AppError(
          409,
          "Only an order not yet being prepared can be cancelled",
        );
    } else staffOutlet(user, order.outletId);
    if (order.version !== version)
      throw new AppError(409, "This order changed. Refresh and try again.");
    if (!canTransition(order.status, status, order.fulfillment))
      throw new AppError(409, "This order stage cannot be changed that way");
    let paymentStatus = order.paymentStatus;
    if (status === "CANCELLED") {
      await releaseRewards(tx, order);
      const captured = await tx.payment.findMany({ where: { orderId: id, status: "PAID", provider: "razorpay" } });
      for (const payment of captured) await queueGatewayRefund(tx, payment.id, "Your order was cancelled before preparation began.");
      await tx.payment.updateMany({
        where: { orderId: id, status: "PAID", provider: "demo" },
        data: { status: "REFUNDED" },
      });
      // A refund may already have been started in the provider dashboard.
      // Cancelling the order must preserve that pending confirmation as well
      // as any refund queued above.
      const pendingRefunds = await tx.payment.count({ where: { orderId: id, status: "REFUND_PENDING" } });
      paymentStatus = pendingRefunds ? "REFUND_PENDING" : "REFUNDED";
    }
    if ((status === "HANDED_OFF" && order.fulfillment === "pickup") || status === "DELIVERED")
      await earnRewards(tx, { ...order, totalPaise: order.totalPaise - order.deliveryFeePaise });
    await tx.message.create({
      data: {
        deliveries: { create: notificationDeliveries() },
        orderId: id,
        kind: status,
        body:
          (
            {
              PREPARING: "Your food is now being prepared.",
              READY: order.fulfillment === "delivery" ? "Your order is ready for delivery handover." : "Your order is ready for pickup.",
              HANDED_OFF: order.fulfillment === "delivery" ? "Your order has been handed to the delivery team." : "Your order has been handed over. Enjoy your meal!",
              OUT_FOR_DELIVERY: "The outlet marked your order out for delivery.",
              DELIVERED: "The outlet confirmed delivery. Enjoy your meal!",
              CANCELLED:
                paymentStatus === "REFUND_PENDING" ? "Your order was cancelled. Your refund is being processed." : "Your order was cancelled and the payment refunded.",
            } as Record<string, string>
          )[status] || status,
      },
    });
    await tx.audit.create({
      data: {
        orderId: id,
        actorId: user.id,
        action: "STATUS",
        detail: `${order.status} → ${status}`,
      },
    });
    return tx.order.update({
      where: { id },
      data: {
        status,
        readyAt: status === "READY" ? new Date() : order.readyAt,
        deliveredAt: status === "DELIVERED" ? new Date() : order.deliveredAt,
        paymentStatus,
        version: { increment: 1 },
      },
    });
  });
}

export async function changePromise(
  id: string,
  minutes: number,
  reason: string,
  version: number,
  user: AuthUser,
) {
  return serializable(async (tx) => {
    const order = await lockOrder(tx, id);
    staffOutlet(user, order.outletId);
    if (
      !["PLACED", "PREPARING"].includes(order.status) ||
      order.version !== version
    )
      throw new AppError(409, "This order changed or is already ready");
    let promisedAt: Date;
    try {
      promisedAt = overridePromise(minutes, order.outlet.minPrepMinutes);
    } catch (error) {
      throw new AppError(400, (error as Error).message);
    }
    await tx.audit.create({
      data: {
        orderId: id,
        actorId: user.id,
        action: "PROMISE_OVERRIDE",
        detail: `${order.promisedAt?.toISOString()} → ${promisedAt.toISOString()}: ${reason}`,
      },
    });
    await tx.message.create({
      data: {
        deliveries: { create: notificationDeliveries() },
        orderId: id,
        kind: `OVERRIDE_${order.version}`,
        body: `The kitchen updated your preparation estimate to ${minutes} minutes from now. ${reason}`,
      },
    });
    return tx.order.update({
      where: { id },
      data: { promisedAt, estimateMinutes: minutes, version: { increment: 1 } },
    });
  });
}

export async function runOrderJobs() {
  const now = new Date();
  const pending = paymentProvider() === "demo" ? await db.payment.findMany({
    where: { provider: "demo", status: "PENDING", resolveAt: { lte: now } },
    select: { id: true, orderId: true },
    take: 30,
  }) : [];
  for (const payment of pending)
    await serializable(async (tx) => {
      await settlePayment(tx, payment.orderId, payment.id);
    });
  const expiring = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of expiring)
    await serializable(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "PENDING_PAYMENT") return;
      await releaseRewards(tx, order);
      await tx.payment.updateMany({
        where: { orderId: id, status: "PENDING" },
        data: { status: "FAILED", resolveAt: null },
      });
      await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          paymentStatus: "FAILED",
          version: { increment: 1 },
        },
      });
    });
  const late = await db.order.findMany({
    where: {
      status: { in: ["PLACED", "PREPARING"] },
      promisedAt: { lte: new Date(now.getTime() - 600000) },
      messages: { none: { kind: "LATE" } },
    },
    select: { id: true },
    take: 50,
  });
  for (const { id } of late)
    await serializable(async (tx) => {
      const order = await lockOrder(tx, id);
      if (
        !["PLACED", "PREPARING"].includes(order.status) ||
        !order.promisedAt ||
        order.promisedAt > new Date(Date.now() - 600000)
      )
        return;
      if (
        await tx.message.findUnique({
          where: { orderId_kind: { orderId: id, kind: "LATE" } },
        })
      )
        return;
      await tx.message.create({
        data: {
          deliveries: { create: notificationDeliveries() },
          orderId: id,
          kind: "LATE",
          body: "Your order is taking longer than promised. The outlet manager has been notified and the kitchen is working on it.",
        },
      });
      await tx.audit.create({
        data: {
          orderId: id,
          action: "LATE_ALERT",
          detail:
            "Preparation promise exceeded by ten minutes; manager alert shown in kitchen.",
        },
      });
      await tx.order.update({
        where: { id },
        data: { version: { increment: 1 } },
      });
    });
  await db.session.deleteMany({ where: { expiresAt: { lt: now } } });
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
}
