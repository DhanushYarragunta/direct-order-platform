import { createHash, randomBytes } from "node:crypto";
import { Prisma, OrderStatus } from "@prisma/client";
import { z } from "zod";
import { db, serializable } from "./db";
import { AppError, AuthUser, staffOutlet } from "./auth";
import {
  cartLineKey,
  canTransition,
  distanceKm,
  estimatePreparation,
  overridePromise,
} from "./domain";
import { checkoutSchema, paymentSchema } from "./validation";
import { priceCart } from "./pricing";
import { menuForOutlet, menuScheduleOpen } from "./menu-context";
import { lockRewards, quoteRewards, releaseRewards, earnRewards, firstOrderEligible } from "./rewards";

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
  messages: { orderBy: { createdAt: "asc" as const } },
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
  return order;
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
      const repeated = await tx.order.findUnique({ where: {
        userId_checkoutKey: { userId: user.id, checkoutKey: input.checkoutKey },
      } });
      if (repeated) {
        if (repeated.cartHash !== cartHash) throw new AppError(409, "This checkout changed. Please start a new checkout.");
        return repeated;
      }
      await tx.$queryRaw`SELECT "id" FROM "Outlet" WHERE "id"=${input.outletId} FOR UPDATE`;
      const outlet = await tx.outlet.findUnique({
        where: { id: input.outletId },
      });
      if (!outlet?.open)
        throw new AppError(409, "This kitchen is currently closed");
      if (
        input.fulfillment === "delivery" &&
        distanceKm(
          { latitude: input.latitude!, longitude: input.longitude! },
          outlet,
        ) > outlet.radiusKm
      )
        throw new AppError(
          400,
          "This address is outside the kitchen's delivery area",
        );
      const priced = await priceCheckoutCart(tx, input);
      const quote = await quoteRewards(tx, user.id, priced.totalPaise, input.couponCode, input.redeemedPoints);
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
          totalPaise: quote.totalPaise,
          gstPaise: quote.gstPaise,
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

async function lockOrder(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${id} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id },
    include: { lines: true, outlet: true },
  });
  if (!order) throw new AppError(404, "Order not found");
  return order;
}

async function settle(
  tx: Prisma.TransactionClient,
  id: string,
  paymentId: string,
) {
  const order = await lockOrder(tx, id);
  await lockRewards(tx, order.userId);
  if (order.status !== "PENDING_PAYMENT" || order.expiresAt < new Date()) {
    await tx.payment.updateMany({
      where: { id: paymentId, status: "PENDING" },
      data: { status: "FAILED", resolveAt: null },
    });
    if (order.status === "PENDING_PAYMENT") {
      await releaseRewards(tx, order);
      await tx.order.update({
        where: { id },
        data: {
          status: "CANCELLED",
          paymentStatus: "FAILED",
          version: { increment: 1 },
        },
      });
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
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "REFUNDED", resolveAt: null },
    });
    await tx.message.create({
      data: {
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
        paymentStatus: "REFUNDED",
        version: { increment: 1 },
      },
    });
  }
  const queue = await tx.order.aggregate({
    where: {
      outletId: order.outletId,
      status: { in: ["PLACED", "PREPARING"] },
    },
    _sum: { workMinutes: true },
  });
  const estimate = estimatePreparation(
    order.workMinutes,
    queue._sum.workMinutes || 0,
    order.outlet.minPrepMinutes,
    order.outlet.activeStations,
  );
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
      promisedAt,
      originalPromisedAt: promisedAt,
      estimateMinutes: estimate.minutes,
      estimateFallback: estimate.fallback,
      version: { increment: 1 },
    },
  });
}

export async function payOrder(
  id: string,
  input: z.infer<typeof paymentSchema>,
  user: AuthUser,
) {
  if (process.env.DEMO_MODE !== "true")
    throw new AppError(403, "The simulated gateway is disabled");
  return serializable(async (tx) => {
    const order = await lockOrder(tx, id);
    if (order.userId !== user.id) throw new AppError(404, "Order not found");
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
    if (input.outcome === "success") return settle(tx, id, payment.id);
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
    if (!canTransition(order.status, status))
      throw new AppError(409, "This order stage cannot be changed that way");
    if (status === "CANCELLED") {
      await releaseRewards(tx, order);
      await tx.payment.updateMany({
        where: { orderId: id, status: "PAID" },
        data: { status: "REFUNDED" },
      });
    }
    if (status === "HANDED_OFF") await earnRewards(tx, order);
    await tx.message.create({
      data: {
        orderId: id,
        kind: status,
        body:
          (
            {
              PREPARING: "Your food is now being prepared.",
              READY: "Your order is ready for pickup.",
              HANDED_OFF: "Your order has been handed over. Enjoy your meal!",
              CANCELLED:
                "Your order was cancelled and the simulated payment refunded.",
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
        paymentStatus:
          status === "CANCELLED" ? "REFUNDED" : order.paymentStatus,
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
  const pending = await db.payment.findMany({
    where: { status: "PENDING", resolveAt: { lte: now } },
    select: { id: true, orderId: true },
    take: 30,
  });
  for (const payment of pending)
    await serializable(async (tx) => {
      await settle(tx, payment.orderId, payment.id);
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
