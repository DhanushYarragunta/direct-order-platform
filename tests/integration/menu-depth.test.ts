import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { checkout, getOrder, payOrder } from "../../src/lib/orders";
import { checkoutSchema } from "../../src/lib/validation";
import type { AuthUser } from "../../src/lib/auth";

let customer: AuthUser;
let itemId: string;
const input = () => checkoutSchema.parse({
  checkoutKey: randomUUID(), outletId: "kondapur",
  lines: [{ itemId, quantity: 1, portion: "regular", addOnIds: [] }],
  fulfillment: "pickup", phone: "9000000000",
});
const closedSchedule = () => ({
  menuDays: [(new Date(Date.now() + 330 * 60000).getUTCDay() + 2) % 7],
  menuStartMinute: 600, menuEndMinute: 660,
});
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") ||
    new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  customer = await db.user.findUniqueOrThrow({ where: { id: "demo-customer" }, include: { outlet: true } });
  const item = await db.menuItem.create({ data: {
    name: "City pricing integration dish", description: "Test-only menu record", category: "Biryani", pricePaise: 20000,
    familyPricePaise: 60000, portion: "Serves 1", vegetarian: true, spice: "Mild", allergens: [], prepMinutes: 5,
    availability: { create: { outletId: "kondapur", available: true } },
    cityPrices: { create: { city: "hyderabad", pricePaise: 34500, familyPricePaise: null } },
  } });
  itemId = item.id;
});
afterAll(async () => {
  if (itemId) await db.menuItem.delete({ where: { id: itemId } });
  await db.$disconnect();
});
describe.sequential("authoritative menu context", () => {
  it("persists the city price in order snapshots and keeps it after later price edits", async () => {
    const order = await checkout(input(), customer);
    expect(order.totalPaise).toBe(34500);
    await db.menuCityPrice.update({ where: { itemId_city: { itemId, city: "hyderabad" } }, data: { pricePaise: 39900 } });
    await payOrder(order.id, { attemptKey: randomUUID(), method: "UPI", outcome: "success" }, customer);
    const saved = await getOrder(order.id, customer);
    expect(saved.totalPaise).toBe(34500);
    expect(saved.lines[0].unitPaise).toBe(34500);
  });
  it("rejects checkout outside service hours even when an item is in stock", async () => {
    await db.menuItem.update({ where: { id: itemId }, data: closedSchedule() });
    try { await expect(checkout(input(), customer)).rejects.toThrow("available"); }
    finally { await db.menuItem.update({ where: { id: itemId }, data: { menuDays: [], menuStartMinute: null, menuEndMinute: null } }); }
  });
  it("refunds a payment if service hours close after checkout", async () => {
    const order = await checkout(input(), customer);
    await db.menuItem.update({ where: { id: itemId }, data: closedSchedule() });
    try {
      await payOrder(order.id, { attemptKey: randomUUID(), method: "UPI", outcome: "success" }, customer);
      const saved = await getOrder(order.id, customer);
      expect(saved.status).toBe("CANCELLED");
      expect(saved.paymentStatus).toBe("REFUNDED");
    } finally { await db.menuItem.update({ where: { id: itemId }, data: { menuDays: [], menuStartMinute: null, menuEndMinute: null } }); }
  });
});
