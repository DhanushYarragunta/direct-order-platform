import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/lib/auth";
import { db, serializable } from "../../src/lib/db";
import { advanceOrder, checkout, payOrder, quoteCheckout } from "../../src/lib/orders";
import { listKitchenOrders } from "../../src/lib/staff-orders";

let customer: AuthUser, kitchen: AuthUser;
const input = () => ({ checkoutKey: randomUUID(), outletId: "kondapur",
  lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular" as const, addOnIds: [] }],
  fulfillment: "delivery" as const, localityId: "kukatpally", localityConfirmed: true,
  phone: "9000000000", address: "Test flat, Kukatpally centre", note: "Delivery regression" });
const payment = () => ({ attemptKey: randomUUID(), method: "UPI" as const, outcome: "success" as const });

beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
  customer = await db.user.create({ data: { name: "Delivery test", email: `delivery-${randomUUID()}@deccan.example`, passwordHash: "test-only" }, include: { outlet: true } });
  kitchen = await db.user.findUniqueOrThrow({ where: { id: "demo-kitchen-kukatpally" }, include: { outlet: true } });
});
afterAll(() => db.$disconnect());

describe.sequential("delivery quality regressions", () => {
  it("routes both quotes and checkout to Kukatpally despite a Kondapur cart", async () => {
    const data = input();
    const quote = await serializable((tx) => quoteCheckout(tx, data, customer.id));
    const order = await checkout({ ...data, expectedTotalPaise: quote.totalPaise }, customer);
    expect(quote.outletId).toBe("kukatpally");
    expect(order.outletId).toBe(quote.outletId);
    expect(order.totalPaise).toBe(quote.totalPaise);
    expect(order.deliveryFeePaise).toBe(4000);
    expect(order.estimateMinutes).toBeGreaterThanOrEqual(quote.minimumMinutes);
  });
  it("shows backlog before payment and rejects unreviewed price changes", async () => {
    const data = input();
    const queue = await db.order.create({ data: { number: `BACKLOG-${randomUUID()}`, checkoutKey: randomUUID(), cartHash: "fixture", userId: customer.id,
      outletId: "kukatpally", status: "PREPARING", paymentStatus: "PAID", totalPaise: 100, workMinutes: 400,
      gstPaise: 5, fulfillment: "pickup", address: "", phone: "9000000000", note: "Fixture", expiresAt: new Date() } });
    try {
      const quote = await serializable((tx) => quoteCheckout(tx, data, customer.id));
      expect(quote.estimateMinutes).toBeGreaterThan(quote.minimumMinutes);
      const order = await checkout(data, customer);
      expect(order.estimateMinutes).toBeGreaterThan(quote.minimumMinutes);
      expect(order.status).toBe("PENDING_PAYMENT");
      await expect(checkout({ ...input(), expectedTotalPaise: 1 }, customer)).rejects.toThrow("price or delivery fee changed");
    } finally { await db.order.delete({ where: { id: queue.id } }); }
  });
  it("enforces outlet stock after automatic routing and free-delivery thresholds", async () => {
    await db.availability.update({ where: { outletId_itemId: { outletId: "kukatpally", itemId: "chicken-biryani" } }, data: { available: false } });
    try { await expect(checkout(input(), customer)).rejects.toThrow("no longer available"); }
    finally { await db.availability.update({ where: { outletId_itemId: { outletId: "kukatpally", itemId: "chicken-biryani" } }, data: { available: true } }); }
    const data = input(); data.lines[0].quantity = 2;
    const order = await checkout(data, customer);
    expect(order.deliveryFeePaise).toBe(0);
    await expect(checkout({ ...input(), lines: [{ itemId: "double-ka-meetha", quantity: 1, portion: "regular", addOnIds: [] }] }, customer)).rejects.toThrow("Delivery needs");
  });
  it("keeps delivery active until delivered and awards food-only points once", async () => {
    const order = await checkout({ ...input(), checkoutStartedAt: new Date(Date.now() - 30000).toISOString() }, customer);
    const paid = await payOrder(order.id, payment(), customer);
    expect(paid.checkoutDurationMs).toBeGreaterThanOrEqual(30000);
    expect(paid.checkoutMetricSource).toBe("demo");
    const preparing = await advanceOrder(order.id, "PREPARING", paid.version, kitchen);
    const ready = await advanceOrder(order.id, "READY", preparing.version, kitchen);
    const handoff = await advanceOrder(order.id, "HANDED_OFF", ready.version, kitchen);
    expect(await db.loyaltyEntry.count({ where: { orderId: order.id, kind: "EARN" } })).toBe(0);
    await db.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 48 * 3600000) } });
    expect((await listKitchenOrders("kukatpally")).some((item) => item.id === order.id)).toBe(true);
    const dispatched = await advanceOrder(order.id, "OUT_FOR_DELIVERY", handoff.version, kitchen);
    const delivered = await advanceOrder(order.id, "DELIVERED", dispatched.version, kitchen);
    expect(delivered.deliveredAt).toBeTruthy();
    const earned = await db.loyaltyEntry.findMany({ where: { orderId: order.id, kind: "EARN" } });
    expect(earned).toHaveLength(1);
    expect(earned[0].points).toBe(3);
    await expect(advanceOrder(order.id, "DELIVERED", dispatched.version, kitchen)).rejects.toThrow("changed");
    const retried = await payOrder(order.id, payment(), customer);
    expect(retried.checkoutDurationMs).toBe(paid.checkoutDurationMs);
  });
});
