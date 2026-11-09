import { describe, expect, it } from "vitest";
import { couponSchema, couponStatus } from "../src/lib/coupon-validation";
import { mergeReorder, reviewReorder } from "../src/lib/reorder";
import type { MenuData, Order } from "../src/lib/types";

const menu = { items: [{ id: "biryani", name: "Biryani", available: true, pricePaise: 35000, familyPricePaise: 99000, portion: "Serves one" }],
  addOns: [{ id: "raita", name: "Raita", pricePaise: 2500 }] } as MenuData;
const line = { itemId: "biryani", portion: "family" as const, quantity: 2, addOnIds: ["raita"] };
const history = [{ id: "old-line", itemId: "biryani", name: "Old name", portion: "family", quantity: 2, unitPaise: 1, addOns: [{ id: "raita", name: "Raita", pricePaise: 1 }] }] as Order["lines"];
const coupon = { code: " NEW10 ", description: "Ten percent off your next meal", type: "PERCENT", value: 10, minSubtotalPaise: 39900,
  maxDiscountPaise: 15000, firstOrderOnly: false, active: true, startsAt: "2026-11-09T00:00:00Z", expiresAt: "2026-12-09T00:00:00Z" };

describe("reorder review", () => {
  it("uses current portion and extra prices rather than historical amounts", () => {
    expect(reviewReorder(history, menu)[0]).toMatchObject({ unitPaise: 101500, reason: null, name: "Biryani", line });
  });
  it("does not substitute discontinued portions, extras or unavailable dishes", () => {
    expect(reviewReorder(history, { ...menu, addOns: [] })[0].reason).toMatch(/extra/);
    expect(reviewReorder(history, { ...menu, items: [{ ...menu.items[0], familyPricePaise: null }] })[0].reason).toMatch(/portion/);
    expect(reviewReorder(history, { ...menu, items: [] })[0].reason).toMatch(/Not available/);
  });
  it("merges exact selections and keeps the input cart unchanged", () => {
    const cart = [{ ...line, quantity: 3 }];
    expect(mergeReorder(cart, [line, { ...line, portion: "regular" }], menu)).toHaveLength(2);
    expect(mergeReorder(cart, [line], menu)[0].quantity).toBe(5);
    expect(cart[0].quantity).toBe(3);
  });
  it("rejects excessive totals across portions atomically and rechecks availability", () => {
    const cart = [{ ...line, quantity: 19 }];
    expect(() => mergeReorder(cart, [{ ...line, portion: "regular" }], menu)).toThrow(/20/);
    expect(cart[0].quantity).toBe(19);
    expect(() => mergeReorder([], [line], { ...menu, addOns: [] })).toThrow(/menu changed/);
    expect(() => mergeReorder([], [{ ...line, quantity: -1 }], menu)).toThrow(/quantities/);
  });
});
describe("coupon editing", () => {
  it("normalizes codes and rejects invalid discounts, dates and injected fields", () => {
    expect(couponSchema.parse(coupon).code).toBe("NEW10");
    for (const change of [{ value: 101 }, { value: 1.5 }, { expiresAt: coupon.startsAt }, { code: "<script>" }, { version: 1 }, { type: "FIXED", value: 50 }])
      expect(couponSchema.safeParse({ ...coupon, ...change }).success).toBe(false);
  });
  it("labels scheduled, live, expired and paused offers at date boundaries", () => {
    const parsed = couponSchema.parse(coupon);
    expect(couponStatus(parsed, Date.parse(parsed.startsAt) - 1)).toBe("Scheduled");
    expect(couponStatus(parsed, Date.parse(parsed.startsAt))).toBe("Active");
    expect(couponStatus(parsed, Date.parse(parsed.expiresAt))).toBe("Expired");
    expect(couponStatus({ ...parsed, active: false })).toBe("Paused");
  });
});
