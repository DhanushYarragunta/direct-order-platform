import { describe, expect, it } from "vitest";
import { menuSuggestions, normalizeMenuQuery, searchMenu } from "../src/lib/menu-search";

const menu = [
  { id: "chicken", name: "Chicken dum biryani", category: "Biryani", description: "Fragrant basmati with saffron", vegetarian: false, available: true },
  { id: "vegetable", name: "Vegetable biryani", category: "Biryani", description: "Seasonal vegetables and basmati", vegetarian: true, available: true },
  { id: "paneer", name: "Paneer tikka", category: "Kebabs", description: "Paneer grilled with spices", vegetarian: true, available: false },
  { id: "meetha", name: "Double ka meetha", category: "Sweets", description: "Bread pudding with saffron", vegetarian: true, available: true },
];

describe("menu search", () => {
  it("matches unordered word prefixes, descriptions and categories", () => {
    expect(searchMenu(menu, "bir chick").map(item => item.id)).toEqual(["chicken"]);
    expect(searchMenu(menu, "SAFFRON").map(item => item.id)).toEqual(["chicken", "meetha"]);
    expect(searchMenu(menu, "sweets").map(item => item.id)).toEqual(["meetha"]);
    expect(searchMenu(menu, "paneer biryani")).toEqual([]);
  });
  it("normalizes spacing, accents and explicit biryani/kebab spellings without arbitrary fuzzy matches", () => {
    expect(normalizeMenuQuery("  CHICKÉN--Biriyani  ")).toBe("chicken biryani");
    for (const spelling of ["biriyani", "briyani", "biriani", "biryanis"])
      expect(searchMenu(menu, spelling)).toHaveLength(2);
    expect(searchMenu(menu, "kabab").map(item => item.id)).toEqual(["paneer"]);
    expect(searchMenu(menu, "ick")).toEqual([]);
    expect(searchMenu(menu, "   ")).toEqual(menu);
    expect(searchMenu(menu, "..." )).toEqual(menu);
  });
  it("ranks a dish-name match before matches in descriptions", () => {
    const dishes = [{ ...menu[3], description: "Enjoy after a chicken dum biryani" }, menu[0]];
    expect(searchMenu(dishes, "chicken dum biryani").map(item => item.id)).toEqual(["chicken", "meetha"]);
  });
  it("shows bounded category and dish suggestions, clearly marking unavailable dishes", () => {
    expect(menuSuggestions(menu, "bir")).toEqual([
      { id: "category-Biryani", value: "Biryani", kind: "category", detail: "2 dishes · Category" },
      { id: "chicken", value: "Chicken dum biryani", kind: "dish", detail: "Biryani" },
      { id: "vegetable", value: "Vegetable biryani", kind: "dish", detail: "Biryani" },
    ]);
    expect(menuSuggestions(menu, "paneer")[0].detail).toContain("Currently unavailable");
    expect(menuSuggestions(Array.from({ length: 20 }, (_, i) => ({ ...menu[0], id: `dish-${i}` })), "bir")).toHaveLength(6);
    expect(menuSuggestions(menu, "")).toEqual([]);
  });
});
