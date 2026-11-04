import { describe, expect, it } from "vitest";
import { menuForOutlet, menuScheduleLabel, menuScheduleOpen, suggestReorders } from "../src/lib/menu-context";
import { menuSchema } from "../src/lib/validation";

const menuItem = {
  name: "Test biryani", description: "Prepared fresh for testing", category: "Biryani",
  pricePaise: 32000, familyPricePaise: 90000, portion: "Serves 1", vegetarian: false,
  spice: "Medium", allergens: [], photo: null, prepMinutes: 15, active: true, featured: false,
};

describe("menu service windows in India Standard Time", () => {
  const mondayDinner = { menuDays: [1], menuStartMinute: 18 * 60, menuEndMinute: 23 * 60 };
  it("treats an unset schedule as available all week", () => {
    expect(menuScheduleOpen({}, new Date("2026-11-03T00:00:00Z"))).toBe(true);
    expect(menuScheduleLabel({})).toBeNull();
  });
  it("includes opening and excludes closing irrespective of host timezone", () => {
    expect(menuScheduleOpen(mondayDinner, new Date("2026-11-02T12:29:59Z"))).toBe(false);
    expect(menuScheduleOpen(mondayDinner, new Date("2026-11-02T12:30:00Z"))).toBe(true);
    expect(menuScheduleOpen(mondayDinner, new Date("2026-11-02T17:29:59Z"))).toBe(true);
    expect(menuScheduleOpen(mondayDinner, new Date("2026-11-02T17:30:00Z"))).toBe(false);
    expect(menuScheduleOpen(mondayDinner, new Date("2026-11-03T12:30:00Z"))).toBe(false);
  });
  it("assigns an overnight window to the day it starts, including week rollover", () => {
    const overnight = { menuDays: [6], menuStartMinute: 22 * 60, menuEndMinute: 2 * 60 };
    expect(menuScheduleOpen(overnight, new Date("2026-11-07T17:00:00Z"))).toBe(true);
    expect(menuScheduleOpen(overnight, new Date("2026-11-07T19:30:00Z"))).toBe(true);
    expect(menuScheduleOpen(overnight, new Date("2026-11-07T20:30:00Z"))).toBe(false);
    expect(menuScheduleOpen(overnight, new Date("2026-11-06T19:30:00Z"))).toBe(false);
    expect(menuScheduleLabel(overnight)).toBe("Sat · 22:00–02:00 next day IST");
  });
  it("fails closed for incomplete or corrupt scheduled hours", () => {
    expect(menuScheduleOpen({ menuStartMinute: 10 })).toBe(false);
    expect(menuScheduleOpen({ menuDays: [1], menuStartMinute: 10, menuEndMinute: 10 })).toBe(false);
    expect(menuScheduleOpen({ ...mondayDinner, menuDays: [8] })).toBe(false);
    expect(menuScheduleOpen(mondayDinner, new Date(NaN))).toBe(false);
  });
});

describe("city pricing and validated menu configuration", () => {
  it("uses only the matching city's override and preserves default family price", () => {
    const item = { ...menuItem, cityPrices: [{ city: "hyderabad", pricePaise: 35000, familyPricePaise: null }] };
    expect(menuForOutlet(item, " Hyderabad ").pricePaise).toBe(35000);
    expect(menuForOutlet(item, "Hyderabad").familyPricePaise).toBe(90000);
    expect(menuForOutlet(item, "Pune").pricePaise).toBe(32000);
    expect(menuForOutlet({ ...item, cityPrices: [{ city: "hyderabad", pricePaise: 35000, familyPricePaise: 98000 }] }, "HYDERABAD").familyPricePaise).toBe(98000);
  });
  it("canonicalises cities and rejects duplicate overrides and invalid prices", () => {
    const price = { city: " Hyderabad ", pricePaise: 35000, familyPricePaise: null };
    expect(menuSchema.parse({ ...menuItem, cityPrices: [price] }).cityPrices[0].city).toBe("hyderabad");
    expect(menuSchema.safeParse({ ...menuItem, cityPrices: [price, { ...price, city: "HYDERABAD" }] }).success).toBe(false);
    expect(menuSchema.safeParse({ ...menuItem, cityPrices: [{ ...price, pricePaise: 0 }] }).success).toBe(false);
  });
  it("requires a complete schedule and unique valid start days", () => {
    expect(menuSchema.safeParse(menuItem).success).toBe(true);
    for (const schedule of [
      { menuDays: [1] }, { menuStartMinute: 100, menuEndMinute: 200 },
      { menuDays: [1, 1], menuStartMinute: 100, menuEndMinute: 200 },
      { menuDays: [1], menuStartMinute: 200, menuEndMinute: 200 },
      { menuDays: [1], menuStartMinute: 1440, menuEndMinute: 200 },
    ]) expect(menuSchema.safeParse({ ...menuItem, ...schedule }).success).toBe(false);
    expect(menuSchema.safeParse({ ...menuItem, menuDays: [5, 6], menuStartMinute: 1320, menuEndMinute: 120 }).success).toBe(true);
  });
});

describe("history-based reorder suggestions", () => {
  it("ranks frequency then recency, omits unavailable dishes, and limits to three", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, available: id !== "d" }));
    const history = [
      { itemId: "a", quantity: 2, orderedAt: new Date(1000) },
      { itemId: "b", quantity: 2, orderedAt: new Date(2000) },
      { itemId: "c", quantity: 1, orderedAt: new Date(1000) },
      { itemId: "d", quantity: 10, orderedAt: new Date(1000) },
      { itemId: "e", quantity: 1, orderedAt: new Date(2000) },
      { itemId: "removed", quantity: 99, orderedAt: new Date(3000) },
    ];
    expect(suggestReorders(items, history)).toEqual(["b", "a", "e"]);
    expect(suggestReorders(items, [])).toEqual([]);
  });
});
