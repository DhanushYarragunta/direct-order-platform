import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { OrderStatus } from "@prisma/client";
import { db } from "../../src/lib/db";
import { listKitchenOrders } from "../../src/lib/staff-orders";

const outletId = `kitchen-query-${randomUUID()}`;
const otherOutletId = `kitchen-query-${randomUUID()}`;
const now = new Date();
const recent = new Date(now.getTime() - 60000);
const yesterday = new Date(now.getTime() - 25 * 3600000);
const activeIds: string[] = [];
const terminalIds: string[] = [];

function order(status: OrderStatus, createdAt: Date, outlet = outletId) {
  const id = randomUUID();
  return {
    id,
    number: `QUERY-${id}`,
    checkoutKey: randomUUID(),
    cartHash: "query-regression-fixture",
    userId: "demo-customer",
    outletId: outlet,
    status,
    paymentStatus: status === "CANCELLED" ? "REFUNDED" as const : "PAID" as const,
    totalPaise: 32000,
    subtotalPaise: 32000,
    gstPaise: 1524,
    workMinutes: 10,
    fulfillment: "pickup",
    address: "",
    phone: "9000000000",
    note: "Kitchen query regression fixture",
    expiresAt: new Date(now.getTime() + 15 * 60000),
    createdAt,
  };
}

beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") ||
    new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");

  await db.outlet.createMany({ data: [outletId, otherOutletId].map((id) => ({
    id, name: "Kitchen query test", address: "Test fixture only",
    latitude: 17.46, longitude: 78.36, fssai: "DEMO-NOT-A-LICENCE",
  })) });
  const statuses: OrderStatus[] = ["PLACED", "PREPARING", "READY"];
  const active = Array.from({ length: 105 }, (_, i) => order(statuses[i % 3], yesterday));
  const history = Array.from({ length: 105 }, (_, i) => order(i % 2 ? "HANDED_OFF" : "CANCELLED", recent));
  activeIds.push(...active.map((row) => row.id));
  terminalIds.push(...history.map((row) => row.id));
  await db.order.createMany({ data: [
    ...active,
    ...history,
    order("HANDED_OFF", yesterday),
    { ...order("PENDING_PAYMENT", recent), paymentStatus: "PENDING" },
    order("PLACED", recent, otherOutletId),
  ] });
});

afterAll(async () => {
  await db.order.deleteMany({ where: { outletId: { in: [outletId, otherOutletId] } } });
  await db.outlet.deleteMany({ where: { id: { in: [outletId, otherOutletId] } } });
  await db.$disconnect();
});

describe("kitchen ticket retrieval", () => {
  it("retains every active ticket despite more than 100 newer completed orders", async () => {
    const orders = await listKitchenOrders(outletId, now);
    const active = orders.filter((row) => ["PLACED", "PREPARING", "READY"].includes(row.status));
    expect(active.map((row) => row.id).sort()).toEqual([...activeIds].sort());
  });

  it("bounds recent history without including unpaid orders or another outlet", async () => {
    const orders = await listKitchenOrders(outletId, now);
    const history = orders.filter((row) => ["HANDED_OFF", "CANCELLED"].includes(row.status));
    expect(history).toHaveLength(100);
    expect(history.every((row) => terminalIds.includes(row.id))).toBe(true);
    expect(orders.every((row) => row.outletId === outletId && row.status !== "PENDING_PAYMENT")).toBe(true);
    expect(orders).toHaveLength(205);
    expect(new Set(orders.map((row) => row.id)).size).toBe(orders.length);
  });
});
