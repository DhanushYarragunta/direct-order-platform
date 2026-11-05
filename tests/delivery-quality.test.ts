import { describe, expect, it } from "vitest";
import { canTransition } from "../src/lib/domain";
import { DELIVERY_LOCALITIES, deliveryFee, deliveryOutlet, deliveryPoint } from "../src/lib/delivery";
import { checkoutSchema } from "../src/lib/validation";
import { validCheckoutStart } from "../src/lib/checkout-timing";

const outlets = DELIVERY_LOCALITIES.map((item) => ({ ...item, radiusKm: 5, open: true }));
const policy = { deliveryFeePaise: 4000, minDeliveryPaise: 19900, freeDeliveryAbovePaise: 59900 };

describe("delivery routing and policy", () => {
  it("routes a Kukatpally coordinate to its nearest eligible kitchen", () => {
    expect(deliveryOutlet(outlets, { latitude: 17.494, longitude: 78.399 }).id).toBe("kukatpally");
  });
  it("routes curated localities without device GPS and rejects unknown localities", () => {
    expect(deliveryOutlet(outlets, { localityId: "kukatpally" }).id).toBe("kukatpally");
    expect(() => deliveryPoint({ localityId: "unverified" })).toThrow("supported");
  });
  it("rejects absent location and coverage when every kitchen is closed", () => {
    expect(() => deliveryPoint({})).toThrow("delivery locality");
    expect(() => deliveryOutlet(outlets.map((outlet) => ({ ...outlet, open: false })), { localityId: "kondapur" })).toThrow("outside");
  });
  it("enforces delivery minimum and free-delivery threshold, never a pickup charge", () => {
    expect(() => deliveryFee(19899, "delivery", policy)).toThrow("₹199");
    expect(deliveryFee(19900, "delivery", policy)).toBe(4000);
    expect(deliveryFee(59899, "delivery", policy)).toBe(4000);
    expect(deliveryFee(59900, "delivery", policy)).toBe(0);
    expect(deliveryFee(10000, "pickup", policy)).toBe(0);
  });
  it("requires address confirmation when a locality substitutes for GPS", () => {
    const input = { checkoutKey: "4508c0f0-e7c3-4d7f-89c4-aa3091909bbf", outletId: "kondapur",
      lines: [{ itemId: "chicken", quantity: 1, portion: "regular", addOnIds: [] }],
      fulfillment: "delivery", phone: "9000000000", address: "Test home in Kukatpally", localityId: "kukatpally" };
    expect(checkoutSchema.safeParse(input).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...input, localityConfirmed: true }).success).toBe(true);
  });
  it("enforces separate delivery and pickup completion sequences", () => {
    expect(canTransition("HANDED_OFF", "OUT_FOR_DELIVERY", "delivery")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "delivery")).toBe(true);
    expect(canTransition("HANDED_OFF", "DELIVERED", "delivery")).toBe(false);
    expect(canTransition("HANDED_OFF", "OUT_FOR_DELIVERY", "pickup")).toBe(false);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED", "pickup")).toBe(false);
    expect(canTransition("DELIVERED", "OUT_FOR_DELIVERY", "delivery")).toBe(false);
  });
});

it("excludes absent, future or stale checkout start times from timing metrics", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  expect(validCheckoutStart(undefined, now)).toBeNull();
  expect(validCheckoutStart("2026-11-05T12:00:01Z", now)).toBeNull();
  expect(validCheckoutStart("2026-11-03T12:00:00Z", now)).toBeNull();
  expect(validCheckoutStart("2026-11-05T11:59:30Z", now)?.toISOString()).toBe("2026-11-05T11:59:30.000Z");
});
