import { gstIncluded } from "./domain";

export type CouponPolicy = {
  code: string;
  type: string;
  value: number;
  minSubtotalPaise: number;
  maxDiscountPaise: number;
  firstOrderOnly: boolean;
  active: boolean;
  startsAt: Date;
  expiresAt: Date;
};

// Demo policy: one point is ₹1; redeem at most 20% after the coupon.
// Points are earned on fulfilled, paid value, not on discounts.
export function calculateRewards(
  subtotalPaise: number,
  coupon: CouponPolicy | null,
  availablePoints: number,
  requestedPoints: number,
  firstOrderEligible: boolean,
  now = new Date(),
) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise <= 0)
    throw new Error("Invalid order subtotal");
  if (!Number.isSafeInteger(requestedPoints) || requestedPoints < 0)
    throw new Error("Choose a whole number of loyalty points");
  let couponDiscountPaise = 0;
  if (coupon) {
    if (!coupon.active || now < coupon.startsAt || now >= coupon.expiresAt)
      throw new Error("This coupon is not currently available");
    if (subtotalPaise < coupon.minSubtotalPaise)
      throw new Error(`This coupon needs an item total of ₹${coupon.minSubtotalPaise / 100} or more`);
    if (coupon.firstOrderOnly && !firstOrderEligible)
      throw new Error("This coupon is for your first paid order; another checkout may already have reserved it");
    const discount = coupon.type === "PERCENT"
      ? Math.floor(subtotalPaise * coupon.value / 100)
      : coupon.type === "FIXED" ? coupon.value : 0;
    if (!Number.isSafeInteger(discount) || discount <= 0)
      throw new Error("This coupon cannot be applied");
    couponDiscountPaise = Math.min(discount, coupon.maxDiscountPaise, subtotalPaise - 100);
  }
  const afterCoupon = subtotalPaise - couponDiscountPaise;
  const maxRedeemablePoints = Math.max(0, Math.min(availablePoints, Math.floor(afterCoupon / 500)));
  if (requestedPoints > maxRedeemablePoints)
    throw new Error(`You can use up to ${maxRedeemablePoints} points on this order. Refresh your checkout.`);
  const totalPaise = afterCoupon - requestedPoints * 100;
  return {
    subtotalPaise,
    couponCode: coupon?.code || null,
    couponDiscountPaise,
    availablePoints,
    maxRedeemablePoints,
    redeemedPoints: requestedPoints,
    totalPaise,
    gstPaise: gstIncluded(totalPaise),
    pointsToEarn: Math.floor(totalPaise / 10000),
  };
}

export type RewardQuote = ReturnType<typeof calculateRewards>;
