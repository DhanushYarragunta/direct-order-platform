import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import input from "../../prisma/catalog/menu.json";
import { expandMenu, menuCatalogSchema } from "../../scripts/menu-expansion";

const catalog = menuCatalogSchema.parse(input);
const newIds = catalog.items.filter(item => !catalog.preservedItemIds.includes(item.id)).map(item => item.id);
let savedItems: Awaited<ReturnType<typeof db.menuItem.findMany>>;
let savedAvailability: Awaited<ReturnType<typeof db.availability.findMany>>;
let originalChicken: Awaited<ReturnType<typeof db.menuItem.findUniqueOrThrow>>;
let originalOutlet: Awaited<ReturnType<typeof db.outlet.findUniqueOrThrow>>;

beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing menu expansion tests outside an isolated core test database");
});
beforeEach(async () => {
  savedItems = await db.menuItem.findMany({ where: { id: { in: newIds } } });
  savedAvailability = await db.availability.findMany({ where: { itemId: { in: newIds } } });
  originalChicken = await db.menuItem.findUniqueOrThrow({ where: { id: "chicken-biryani" } });
  originalOutlet = await db.outlet.findUniqueOrThrow({ where: { id: "kondapur" } });
  // Only the disposable verification database is reduced to the original seven.
  await db.menuItem.deleteMany({ where: { id: { in: newIds } } });
});
afterEach(async () => {
  await db.menuItem.deleteMany({ where: { id: { in: newIds } } });
  if (savedItems.length) await db.menuItem.createMany({ data: savedItems });
  if (savedAvailability.length) await db.availability.createMany({ data: savedAvailability });
  await db.menuItem.update({ where: { id: originalChicken.id }, data: originalChicken });
  await db.outlet.update({ where: { id: originalOutlet.id }, data: originalOutlet });
});
afterAll(() => db.$disconnect());

describe.sequential("additive menu expansion", () => {
  it("plans 53 dishes and 159 availability rows, preserves existing edits, then repeats without writes", async () => {
    const users = await db.user.count(), orders = await db.order.count();
    await db.menuItem.update({ where: { id: "chicken-biryani" }, data: { pricePaise: 33300, active: false } });
    await db.outlet.update({ where: { id: "kondapur" }, data: { name: "Manager-edited outlet", open: false } });
    const plan = await expandMenu(db, catalog);
    expect(plan.insert).toEqual({ menuItems: 53, availability: 159 });
    expect(await db.menuItem.count()).toBe(7);
    expect((await expandMenu(db, catalog, true)).insert).toEqual(plan.insert);
    expect(await db.menuItem.count()).toBe(60);
    expect((await expandMenu(db, catalog, true)).insert).toEqual({ menuItems: 0, availability: 0 });
    expect(await db.menuItem.findUniqueOrThrow({ where: { id: "chicken-biryani" } })).toMatchObject({ pricePaise: 33300, active: false });
    expect(await db.outlet.findUniqueOrThrow({ where: { id: "kondapur" } })).toMatchObject({ name: "Manager-edited outlet", open: false });
    expect(await db.user.count()).toBe(users); expect(await db.order.count()).toBe(orders);
  });
  it("aborts before any additions when a target ID conflicts with existing menu content", async () => {
    const item = catalog.items.find(row => row.id === newIds[0])!;
    await db.menuItem.create({ data: { ...item, pricePaise: item.pricePaise + 100 } });
    await expect(expandMenu(db, catalog, true)).rejects.toThrow("administrator edits were preserved");
    expect(await db.menuItem.count()).toBe(8);
    expect(await db.availability.count({ where: { itemId: { in: newIds } } })).toBe(0);
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: item.id } })).pricePaise).toBe(item.pricePaise + 100);
  });
  it("never reopens a dish that a manager marked unavailable after expansion", async () => {
    await expandMenu(db, catalog, true);
    await db.availability.update({ where: { outletId_itemId: { outletId: "kondapur", itemId: newIds[0] } }, data: { available: false } });
    expect((await expandMenu(db, catalog, true)).insert).toEqual({ menuItems: 0, availability: 0 });
    expect((await db.availability.findUniqueOrThrow({ where: { outletId_itemId: { outletId: "kondapur", itemId: newIds[0] } } })).available).toBe(false);
  });
});
