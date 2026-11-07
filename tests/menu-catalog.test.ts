import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import catalogInput from "../prisma/catalog/menu.json";
import photoSources from "../prisma/catalog/photo-sources.json";
import originalBundle from "../prisma/bootstrap/business-test.json";
import { CATEGORIES, PHOTOS } from "../src/lib/domain";
import { menuForOutlet } from "../src/lib/menu-context";
import { assertMenuExpansionEnvironment, menuCatalogSchema } from "../scripts/menu-expansion";

describe("expanded restaurant catalog", () => {
  const catalog = menuCatalogSchema.parse(catalogInput);
  it("contains 60 distinct dishes across nine populated categories and preserves the original seven", () => {
    expect(catalog.items).toHaveLength(60);
    expect(new Set(catalog.items.map(item => item.id)).size).toBe(60);
    expect(CATEGORIES).toHaveLength(9);
    for (const category of CATEGORIES) expect(catalog.items.filter(item => item.category === category).length).toBeGreaterThanOrEqual(5);
    for (const original of originalBundle.menuItems)
      expect(catalog.items.find(item => item.id === original.id)).toEqual(original);
    expect(catalog.items.filter(item => item.vegetarian)).toHaveLength(40);
  });
  it("provides validated portions, prices and local dish photography", () => {
    for (const item of catalog.items) {
      expect(item.pricePaise).toBeGreaterThanOrEqual(4000);
      expect(item.pricePaise).toBeLessThanOrEqual(45000);
      expect(item.portion.length).toBeGreaterThan(2);
      expect(item.photo && (PHOTOS as readonly string[]).includes(item.photo)).toBe(true);
      expect(existsSync(`public${item.photo}`)).toBe(true);
      expect(menuForOutlet(item, "Hyderabad").pricePaise).toBe(item.pricePaise);
    }
    expect(menuForOutlet({ ...catalog.items.find(item => item.id === "mutton-biryani")!, cityPrices: [
      { city: "hyderabad", pricePaise: 44000, familyPricePaise: null },
    ] }, "HYDERABAD")).toMatchObject({ pricePaise: 44000, familyPricePaise: 120000 });
  });
  it("retains licensed source attribution and matching image digests for every added dish", () => {
    const additions = catalog.items.filter(item => !catalog.preservedItemIds.includes(item.id));
    expect(photoSources).toHaveLength(53);
    expect(new Set(photoSources.map(source => source.id)).size).toBe(53);
    for (const item of additions) {
      const source = photoSources.find(row => row.id === item.id)!;
      expect(source).toBeDefined();
      expect(source.path).toBe(item.photo);
      expect(new URL(source.sourceUrl).hostname).toBe("commons.wikimedia.org");
      expect(new URL(source.licenseUrl).hostname).toBe("creativecommons.org");
      expect(source.license).toMatch(/^(CC BY(?:-SA)? [234]\.0(?: [a-z]{2})?|CC0|Public domain)$/);
      if (source.license.startsWith("CC BY")) expect(source.author.trim().length).toBeGreaterThan(0);
      expect(createHash("sha256").update(readFileSync(`public${source.path}`)).digest("hex")).toBe(source.sha256);
    }
  });
  it("rejects duplicate identities, invented categories, invalid prices and unsafe expansion modes", () => {
    expect(menuCatalogSchema.safeParse({ ...catalogInput, items: [...catalogInput.items.slice(1), catalogInput.items[1]] }).success).toBe(false);
    expect(menuCatalogSchema.safeParse({ ...catalogInput, items: catalogInput.items.map((item, index) => index ? item : { ...item, category: "Made up" }) }).success).toBe(false);
    expect(menuCatalogSchema.safeParse({ ...catalogInput, items: catalogInput.items.map((item, index) => index ? item : { ...item, pricePaise: 0 }) }).success).toBe(false);
    const sha256 = createHash("sha256").update(readFileSync("prisma/catalog/menu.json")).digest("hex");
    const env = { DEMO_MODE: "false", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_fixture", ALLOW_PUBLIC_TEST_PAYMENTS: "true" };
    expect(() => assertMenuExpansionEnvironment(env, sha256, false)).not.toThrow();
    expect(() => assertMenuExpansionEnvironment(env, sha256, true)).toThrow("approved");
    expect(() => assertMenuExpansionEnvironment({ ...env, APPLY_MENU_EXPANSION: "true", MENU_EXPANSION_SHA256: "wrong" }, sha256, true)).toThrow("approved");
    expect(() => assertMenuExpansionEnvironment({ ...env, APPLY_MENU_EXPANSION: "true", MENU_EXPANSION_SHA256: sha256 }, sha256, true)).not.toThrow();
    expect(() => assertMenuExpansionEnvironment({ ...env, RAZORPAY_KEY_ID: "rzp_live_fixture" }, sha256, false)).toThrow("restricted");
  });
});
