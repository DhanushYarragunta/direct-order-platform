import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { bootstrapBusiness, loadBusinessBundle } from "../../scripts/business-bootstrap";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
afterAll(() => db.$disconnect());
const created: ReturnType<typeof loadBusinessBundle>["bundle"][] = [];
afterEach(async () => {
  for (const bundle of created.splice(0)) {
    await db.menuItem.deleteMany({ where: { id: { in: bundle.menuItems.map(row => row.id) } } });
    await db.outlet.deleteMany({ where: { id: { in: bundle.outlets.map(row => row.id) } } });
    await db.addOn.deleteMany({ where: { id: { in: bundle.addOns.map(row => row.id) } } });
  }
});
function isolatedBundle() {
  const bundle = structuredClone(loadBusinessBundle().bundle), suffix = randomUUID().slice(0, 8);
  bundle.outlets.forEach(row => { row.id += `-${suffix}`; });
  bundle.menuItems.forEach(row => { row.id += `-${suffix}`; });
  bundle.addOns.forEach(row => { row.id += `-${suffix}`; });
  bundle.availability.forEach(row => { row.outletId += `-${suffix}`; row.itemId += `-${suffix}`; });
  bundle.cityPrices.forEach(row => { row.itemId += `-${suffix}`; });
  created.push(bundle);
  return bundle;
}
describe.sequential("business bootstrap database isolation", () => {
  it("plans without writes, imports only catalog data, and is a no-op on repeat", async () => {
    const bundle = isolatedBundle(), users = await db.user.count(), orders = await db.order.count(), rewards = await db.loyaltyEntry.count();
    const planned = await bootstrapBusiness(db, bundle);
    expect(planned.mode).toBe("dry-run"); expect(planned.insert).toEqual({ outlets: 3, menuItems: 7, addOns: 2, availability: 21, cityPrices: 0 });
    expect(await db.outlet.count({ where: { id: { in: bundle.outlets.map(row => row.id) } } })).toBe(0);
    expect((await bootstrapBusiness(db, bundle, true)).insert).toEqual(planned.insert);
    expect((await bootstrapBusiness(db, bundle, true)).insert).toEqual({ outlets: 0, menuItems: 0, addOns: 0, availability: 0, cityPrices: 0 });
    expect(await db.user.count()).toBe(users); expect(await db.order.count()).toBe(orders); expect(await db.loyaltyEntry.count()).toBe(rewards);
    expect(await db.outlet.findUniqueOrThrow({ where: { id: bundle.outlets[0].id } })).toMatchObject({ fssai: "", fssaiVerified: false });
  });
  it("aborts an entire import when an existing catalog record differs", async () => {
    const bundle = isolatedBundle(), preserved = { ...bundle.menuItems[0], pricePaise: bundle.menuItems[0].pricePaise + 100 };
    await db.menuItem.create({ data: preserved });
    await expect(bootstrapBusiness(db, bundle, true)).rejects.toThrow("conflict");
    expect(await db.outlet.count({ where: { id: { in: bundle.outlets.map(row => row.id) } } })).toBe(0);
    expect(await db.addOn.count({ where: { id: { in: bundle.addOns.map(row => row.id) } } })).toBe(0);
    expect((await db.menuItem.findUniqueOrThrow({ where: { id: preserved.id } })).pricePaise).toBe(preserved.pricePaise);
  });
});
