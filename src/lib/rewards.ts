import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError } from "./auth";
import { calculateRewards } from "./reward-policy";

export async function lockRewards(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
}

export async function rewardBalance(tx: Prisma.TransactionClient, userId: string) {
  const value = await tx.loyaltyEntry.aggregate({ where: { userId }, _sum: { points: true } });
  return value._sum.points || 0;
}

export async function firstOrderEligible(tx: Prisma.TransactionClient, userId: string, excludeId?: string) {
  return !(await tx.order.findFirst({
    where: {
      userId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        { paymentStatus: "PAID" },
        { status: "PENDING_PAYMENT", couponCode: "WELCOME100", expiresAt: { gt: new Date() } },
      ],
    },
    select: { id: true },
  }));
}

export async function quoteRewards(
  tx: Prisma.TransactionClient,
  userId: string,
  subtotalPaise: number,
  couponCode?: string,
  redeemedPoints = 0,
  useMaximum = false,
) {
  const code = couponCode?.trim().toUpperCase();
  const coupon = code ? await tx.coupon.findUnique({ where: { code } }) : null;
  if (code && !coupon) throw new AppError(400, "Coupon not found. Check the code and try again.");
  const balance = await rewardBalance(tx, userId);
  const eligible = !coupon?.firstOrderOnly || await firstOrderEligible(tx, userId);
  try {
    const base = calculateRewards(subtotalPaise, coupon, balance, 0, eligible);
    return calculateRewards(subtotalPaise, coupon, balance,
      useMaximum ? base.maxRedeemablePoints : redeemedPoints, eligible);
  } catch (error) {
    throw new AppError(409, (error as Error).message);
  }
}

export async function releaseRewards(tx: Prisma.TransactionClient, order: { id: string; userId: string; redeemedPoints: number }) {
  if (!order.redeemedPoints) return;
  await lockRewards(tx, order.userId);
  await tx.loyaltyEntry.upsert({
    where: { orderId_kind: { orderId: order.id, kind: "RELEASE" } },
    create: { userId: order.userId, orderId: order.id, kind: "RELEASE", points: order.redeemedPoints },
    update: {},
  });
}

export async function earnRewards(tx: Prisma.TransactionClient, order: { id: string; userId: string; totalPaise: number }) {
  const points = Math.floor(order.totalPaise / 10000);
  if (!points) return;
  await lockRewards(tx, order.userId);
  await tx.loyaltyEntry.upsert({
    where: { orderId_kind: { orderId: order.id, kind: "EARN" } },
    create: { userId: order.userId, orderId: order.id, kind: "EARN", points },
    update: {},
  });
}

export async function rewardsSummary(userId: string) {
  const now = new Date();
  const [balance, entries, coupons] = await Promise.all([
    rewardBalance(db, userId),
    db.loyaltyEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12,
      select: { id: true, kind: true, points: true, createdAt: true, order: { select: { number: true } } } }),
    db.coupon.findMany({ where: { active: true, startsAt: { lte: now }, expiresAt: { gt: now } },
      select: { code: true, description: true }, orderBy: { code: "asc" } }),
  ]);
  return { balance, entries, coupons };
}
