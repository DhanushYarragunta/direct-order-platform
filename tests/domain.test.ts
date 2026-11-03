import { describe, expect, it } from "vitest";
import {
  canTransition,
  cartLineKey,
  chooseOutlet,
  estimatePreparation,
  gstIncluded,
  isLateAlert,
  overridePromise,
} from "../src/lib/domain";
import { priceCart } from "../src/lib/pricing";
import {
  checkoutSchema,
  menuSchema,
  registerSchema,
} from "../src/lib/validation";
import { hashPassword, verifyPassword } from "../src/lib/password";

const chicken = {
  id: "chicken",
  name: "Chicken biryani",
  photo: null,
  pricePaise: 32000,
  familyPricePaise: 90000,
  prepMinutes: 18,
  active: true,
  available: true,
};
const sweet = {
  ...chicken,
  id: "sweet",
  name: "Double ka meetha",
  pricePaise: 14000,
  familyPricePaise: null,
  prepMinutes: 4,
};
const line = {
  itemId: "chicken",
  quantity: 1,
  portion: "regular" as const,
  addOnIds: [],
};
describe("trusted checkout pricing", () => {
  it("reproduces the ₹1,180 family order and extracts inclusive GST", () => {
    const p = priceCart(
      [
        { ...line, portion: "family" },
        { ...line, itemId: "sweet", quantity: 2 },
      ],
      [chicken, sweet],
      [],
    );
    expect(p.totalPaise).toBe(118000);
    expect(gstIncluded(p.totalPaise)).toBe(5619);
  });
  it("prices add-ons for every portion and includes their prep work", () => {
    const p = priceCart(
      [{ ...line, quantity: 2, addOnIds: ["raita"] }],
      [chicken],
      [
        {
          id: "raita",
          name: "Raita",
          pricePaise: 3000,
          prepMinutes: 1,
          active: true,
        },
      ],
    );
    expect(p.totalPaise).toBe(70000);
    expect(p.workMinutes).toBe(38);
  });
  it.each([
    { ...chicken, available: false },
    { ...chicken, active: false },
  ])("rejects unavailable dishes", (item) => {
    expect(() => priceCart([line], [item], [])).toThrow("no longer available");
  });
  it("rejects a removed family option", () => {
    expect(() =>
      priceCart([{ ...line, itemId: "sweet", portion: "family" }], [sweet], []),
    ).toThrow("Family portion");
  });
  it("limits aggregate quantities across different customisations", () => {
    expect(() =>
      priceCart(
        [
          { ...line, quantity: 15 },
          { ...line, portion: "family", quantity: 6 },
        ],
        [chicken],
        [],
      ),
    ).toThrow("Maximum 20");
  });
  it("rejects duplicate lines and add-ons", () => {
    expect(() => priceCart([line, line], [chicken], [])).toThrow("duplicate");
    expect(() =>
      priceCart([{ ...line, addOnIds: ["x", "x"] }], [chicken], []),
    ).toThrow("Duplicate");
  });
  it("rejects removed extras and zero quantities", () => {
    expect(() =>
      priceCart([{ ...line, addOnIds: ["removed"] }], [chicken], []),
    ).toThrow("add-on");
    expect(() => priceCart([{ ...line, quantity: 0 }], [chicken], [])).toThrow(
      "Maximum",
    );
  });
  it("normalises add-on order for the cart key", () => {
    expect(cartLineKey({ ...line, addOnIds: ["b", "a"] })).toBe(
      cartLineKey({ ...line, addOnIds: ["a", "b"] }),
    );
  });
});
describe("preparation automation", () => {
  it("never promises less than the kitchen minimum", () => {
    expect(estimatePreparation(1, 0, 30, 4)).toEqual({
      minutes: 30,
      fallback: false,
    });
  });
  it("accounts for kitchen backlog", () => {
    expect(estimatePreparation(20, 120, 25, 4)).toEqual({
      minutes: 50,
      fallback: false,
    });
  });
  it("uses a safe fallback for invalid capacity", () => {
    expect(estimatePreparation(20, 120, 25, 0)).toEqual({
      minutes: 25,
      fallback: true,
    });
    expect(estimatePreparation(NaN, 0, NaN, 4).minutes).toBe(30);
  });
  it("rejects overrides below the minimum", () => {
    expect(() => overridePromise(20, 25)).toThrow();
    expect(overridePromise(35, 25, new Date(0)).getTime()).toBe(35 * 60000);
  });
  it("alerts at ten minutes late but not after readiness", () => {
    expect(isLateAlert("PREPARING", new Date(0), new Date(599999))).toBe(false);
    expect(isLateAlert("PREPARING", new Date(0), new Date(600000))).toBe(true);
    expect(isLateAlert("READY", new Date(0), new Date(900000))).toBe(false);
  });
  it("enforces kitchen stage order", () => {
    expect(canTransition("PLACED", "PREPARING")).toBe(true);
    expect(canTransition("PLACED", "READY")).toBe(false);
    expect(canTransition("PREPARING", "CANCELLED")).toBe(false);
    expect(canTransition("READY", "HANDED_OFF")).toBe(true);
  });
});
describe("location and input safety", () => {
  const outlets = [
    {
      id: "near",
      latitude: 17.462,
      longitude: 78.357,
      radiusKm: 5,
      open: true,
    },
    { id: "far", latitude: 17.494, longitude: 78.399, radiusKm: 5, open: true },
  ];
  it("selects the nearest open kitchen inside its radius", () => {
    expect(
      chooseOutlet(outlets, { latitude: 17.461, longitude: 78.358 })?.id,
    ).toBe("near");
    expect(
      chooseOutlet(outlets, { latitude: 28.6, longitude: 77.2 }),
    ).toBeNull();
    expect(
      chooseOutlet(
        outlets.map((o) => ({ ...o, open: false })),
        outlets[0],
      ),
    ).toBeNull();
  });
  const checkout = {
    checkoutKey: "4508c0f0-e7c3-4d7f-89c4-aa3091909bbf",
    outletId: "kondapur",
    lines: [line],
    fulfillment: "pickup",
    phone: "9000000000",
  };
  it("requires delivery coordinates and rejects client-supplied prices", () => {
    expect(checkoutSchema.safeParse(checkout).success).toBe(true);
    expect(
      checkoutSchema.safeParse({
        ...checkout,
        fulfillment: "delivery",
        address: "Complete address",
      }).success,
    ).toBe(false);
    expect(
      checkoutSchema.safeParse({ ...checkout, totalPaise: 1 }).success,
    ).toBe(false);
  });
  it("requires data consent without silently opting into marketing", () => {
    const account = {
      name: "Test user",
      email: "test@example.com",
      password: "long-enough-password",
      consent: true,
    };
    expect(registerSchema.parse(account).marketingOptIn).toBe(false);
    expect(
      registerSchema.safeParse({ ...account, consent: false }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...account, role: "ADMIN" }).success,
    ).toBe(false);
  });
  it("limits photos to the supplied local library", () => {
    expect(
      menuSchema.shape.photo.safeParse("https://untrusted.example/photo.jpg")
        .success,
    ).toBe(false);
    expect(
      menuSchema.shape.photo.safeParse("/food/chicken-biryani.jpg").success,
    ).toBe(true);
  });
  it("salts password hashes and verifies without plaintext storage", () => {
    const a = hashPassword("long-password"),
      b = hashPassword("long-password");
    expect(a).not.toBe(b);
    expect(verifyPassword("long-password", a)).toBe(true);
    expect(verifyPassword("wrong-password", a)).toBe(false);
    expect(verifyPassword("anything", "corrupt")).toBe(false);
  });
});
