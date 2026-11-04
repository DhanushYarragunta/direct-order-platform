import { describe, expect, it } from "vitest";
import { calculateRewards, type CouponPolicy } from "../src/lib/reward-policy";
import { quoteSchema } from "../src/lib/validation";

const coupon: CouponPolicy = {
  code: "BIRYANI10", type: "PERCENT", value: 10, minSubtotalPaise: 39900,
  maxDiscountPaise: 15000, firstOrderOnly: false, active: true,
  startsAt: new Date("2020-01-01"), expiresAt: new Date("2099-01-01"),
};
describe("coupon and loyalty policy", () => {
  it("caps the coupon and computes GST from the amount actually payable", () => {
    const quote = calculateRewards(200000, coupon, 1000, 300, true);
    expect(quote.couponDiscountPaise).toBe(15000);
    expect(quote.maxRedeemablePoints).toBe(370);
    expect(quote.totalPaise).toBe(155000);
    expect(quote.gstPaise).toBe(Math.round(155000 * 5 / 105));
    expect(quote.pointsToEarn).toBe(15);
  });
  it("applies the 20% ceiling after the coupon with integer point rounding", () => {
    const quote = calculateRewards(49900, coupon, 1000, 89, true);
    expect(quote.maxRedeemablePoints).toBe(89);
    expect(quote.totalPaise).toBe(36010);
    expect(() => calculateRewards(49900, coupon, 1000, 90, true)).toThrow("up to 89");
  });
  it("rejects insufficient balance, fractions, expired coupons, and low subtotal", () => {
    expect(() => calculateRewards(64000, null, 5, 6, true)).toThrow("up to 5");
    expect(() => calculateRewards(64000, null, 5, 1.2, true)).toThrow("whole number");
    expect(() => calculateRewards(64000, { ...coupon, expiresAt: new Date(0) }, 0, 0, true)).toThrow("not currently");
    expect(() => calculateRewards(32000, coupon, 0, 0, true)).toThrow("₹399");
  });
  it("requires first-order eligibility and discounts fixed coupons correctly", () => {
    const welcome = { ...coupon, code: "WELCOME100", type: "FIXED", value: 10000, minSubtotalPaise: 49900, maxDiscountPaise: 10000, firstOrderOnly: true };
    expect(() => calculateRewards(64000, welcome, 0, 0, false)).toThrow("first paid");
    expect(calculateRewards(64000, welcome, 0, 0, true).totalPaise).toBe(54000);
  });
  it("never accepts client-supplied prices in a quote", () => {
    expect(quoteSchema.safeParse({ outletId: "kondapur", lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular", addOnIds: [] }], totalPaise: 1 }).success).toBe(false);
  });
});
