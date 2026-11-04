import { describe, expect, it } from "vitest";
import {
  cateringSchema,
  cateringDecisionSchema,
  cateringEventDate,
  cateringLocalDate,
  checkCateringNotice,
} from "../src/lib/catering-validation";

describe("party request policy", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  it("enforces the minimum notice and maximum booking horizon at their boundaries", () => {
    expect(() =>
      checkCateringNotice(new Date(now.getTime() + 24 * 3600000), now),
    ).not.toThrow();
    expect(() =>
      checkCateringNotice(new Date(now.getTime() + 24 * 3600000 - 1), now),
    ).toThrow("24 hours");
    expect(() =>
      checkCateringNotice(new Date(now.getTime() + 180 * 86400000), now),
    ).not.toThrow();
    expect(() =>
      checkCateringNotice(new Date(now.getTime() + 180 * 86400000 + 1), now),
    ).toThrow("180 days");
    expect(() => checkCateringNotice(new Date("invalid"), now)).toThrow(
      "24 hours",
    );
  });

  it("uses India time regardless of the browser timezone and rejects impossible calendar input", () => {
    expect(cateringEventDate("2026-11-05T19:30")).toBe(
      "2026-11-05T14:00:00.000Z",
    );
    expect(cateringLocalDate(new Date("2026-11-05T14:00:00Z"))).toBe(
      "2026-11-05T19:30",
    );
    expect(() => cateringEventDate("2026-02-30T19:30")).toThrow("valid");
    expect(() => cateringEventDate("2026-11-05")).toThrow("date and time");
  });

  it("rejects unknown fields, invalid party sizes, and missing manager reasoning", () => {
    const valid = {
      requestKey: "00000000-0000-4000-8000-000000000000",
      outletId: "kondapur",
      eventAt: "2026-11-05T19:30:00+05:30",
      guestCount: 20,
      occasion: "Team lunch",
      contactName: "Demo guest",
      phone: "9000000000",
      address: "Demo office, Kondapur",
      menuNotes: "Ten veg and ten chicken meals",
      budgetPaise: null,
    };
    expect(cateringSchema.safeParse(valid).success).toBe(true);
    expect(cateringSchema.safeParse({ ...valid, guestCount: 9 }).success).toBe(
      false,
    );
    expect(
      cateringSchema.safeParse({ ...valid, guestCount: 501 }).success,
    ).toBe(false);
    expect(
      cateringSchema.safeParse({ ...valid, guestCount: 10.5 }).success,
    ).toBe(false);
    expect(
      cateringSchema.safeParse({ ...valid, status: "CONFIRMED" }).success,
    ).toBe(false);
    expect(
      cateringSchema.safeParse({ ...valid, budgetPaise: 99999 }).success,
    ).toBe(false);
    expect(
      cateringDecisionSchema.safeParse({
        status: "CONFIRMED",
        managerNote: "",
        version: 0,
      }).success,
    ).toBe(false);
  });
});
