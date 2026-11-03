import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import {
  checkout,
  payOrder,
  advanceOrder,
  changePromise,
  getOrder,
  runOrderJobs,
} from "../../src/lib/orders";
import type { AuthUser } from "../../src/lib/auth";

let customer: AuthUser,
  kitchen: AuthUser,
  manager: AuthUser,
  otherKitchen: AuthUser,
  other: AuthUser;
const input = () => ({
  checkoutKey: randomUUID(),
  outletId: "kondapur",
  lines: [
    {
      itemId: "chicken-biryani",
      quantity: 1,
      portion: "regular" as const,
      addOnIds: [],
    },
  ],
  fulfillment: "pickup" as const,
  address: "",
  phone: "9000000000",
  note: "Integration test",
});
const payment = (outcome: "success" | "failed" | "pending" = "success") => ({
  attemptKey: randomUUID(),
  method: "UPI" as const,
  outcome,
});
beforeAll(async () => {
  if (
    !process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") ||
    new URL(process.env.DATABASE_URL!).pathname !==
      `/${process.env.CORE_TEST_DATABASE}`
  )
    throw new Error("Refusing tests outside an isolated core test database.");
  customer = await db.user.findUniqueOrThrow({
    where: { id: "demo-customer" },
    include: { outlet: true },
  });
  kitchen = await db.user.findUniqueOrThrow({
    where: { id: "demo-kitchen-kondapur" },
    include: { outlet: true },
  });
  otherKitchen = await db.user.findUniqueOrThrow({
    where: { id: "demo-kitchen-kukatpally" },
    include: { outlet: true },
  });
  manager = await db.user.findUniqueOrThrow({
    where: { id: "demo-manager" },
    include: { outlet: true },
  });
  other = await db.user.create({
    data: {
      email: "other@deccan.example",
      name: "Other customer",
      passwordHash: "test-only",
      role: "CUSTOMER",
    },
    include: { outlet: true },
  });
});
afterAll(() => db.$disconnect());
describe.sequential("real PostgreSQL order lifecycle", () => {
  it("deduplicates simultaneous checkout retries and rejects changed payloads", async () => {
    const data = input();
    const [a, b] = await Promise.all([
      checkout(data, customer),
      checkout(data, customer),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.totalPaise).toBe(32000);
    await expect(
      checkout({ ...data, note: "Changed" }, customer),
    ).rejects.toThrow("checkout changed");
  });
  it("rejects delivery beyond the selected outlet radius", async () => {
    await expect(
      checkout(
        {
          ...input(),
          fulfillment: "delivery",
          address: "Outside Hyderabad",
          latitude: 28.6,
          longitude: 77.2,
        },
        customer,
      ),
    ).rejects.toThrow("outside");
  });
  it("makes payment retries idempotent under concurrency", async () => {
    const order = await checkout(input(), customer);
    const attempt = payment();
    await Promise.all([
      payOrder(order.id, attempt, customer),
      payOrder(order.id, attempt, customer),
    ]);
    const saved = await getOrder(order.id, customer);
    expect(saved.status).toBe("PLACED");
    expect(saved.payments.filter((p) => p.status === "PAID")).toHaveLength(1);
    expect(saved.messages.filter((m) => m.kind === "PLACED")).toHaveLength(1);
    expect(saved.estimateMinutes).toBeGreaterThanOrEqual(
      saved.outlet.minPrepMinutes,
    );
  });
  it("keeps failed payments out of the kitchen and allows a new attempt", async () => {
    const order = await checkout(input(), customer);
    await payOrder(order.id, payment("failed"), customer);
    expect((await getOrder(order.id, customer)).status).toBe("PENDING_PAYMENT");
    await payOrder(order.id, payment(), customer);
    expect((await getOrder(order.id, customer)).status).toBe("PLACED");
  });
  it("settles delayed payments once even with overlapping workers", async () => {
    const order = await checkout(input(), customer);
    await payOrder(order.id, payment("pending"), customer);
    await db.payment.updateMany({
      where: { orderId: order.id },
      data: { resolveAt: new Date(0) },
    });
    await Promise.all([runOrderJobs(), runOrderJobs()]);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("PAID");
    expect(
      await db.message.count({ where: { orderId: order.id, kind: "PLACED" } }),
    ).toBe(1);
  });
  it("refunds an accepted test payment when stock changes before settlement", async () => {
    const order = await checkout(input(), customer);
    await payOrder(order.id, payment("pending"), customer);
    await db.availability.update({
      where: {
        outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" },
      },
      data: { available: false },
    });
    try {
      await db.payment.updateMany({
        where: { orderId: order.id },
        data: { resolveAt: new Date(0) },
      });
      await runOrderJobs();
      const saved = await getOrder(order.id, customer);
      expect(saved.status).toBe("CANCELLED");
      expect(saved.paymentStatus).toBe("REFUNDED");
    } finally {
      await db.availability.update({
        where: {
          outletId_itemId: { outletId: "kondapur", itemId: "chicken-biryani" },
        },
        data: { available: true },
      });
    }
  });
  it("expires abandoned checkouts and rejects later payments", async () => {
    const order = await checkout(input(), customer);
    await db.order.update({
      where: { id: order.id },
      data: { expiresAt: new Date(0) },
    });
    await runOrderJobs();
    expect((await getOrder(order.id, customer)).status).toBe("CANCELLED");
    await expect(payOrder(order.id, payment(), customer)).rejects.toThrow(
      "expired",
    );
  });
  it("isolates customers and kitchen outlets", async () => {
    const order = await checkout(input(), customer);
    await expect(getOrder(order.id, other)).rejects.toThrow("not found");
    await expect(getOrder(order.id, otherKitchen)).rejects.toThrow(
      "outside your access",
    );
    await expect(payOrder(order.id, payment(), other)).rejects.toThrow(
      "not found",
    );
  });
  it("enforces stages and optimistic versions through handoff", async () => {
    const order = await checkout(input(), customer);
    const paid = await payOrder(order.id, payment(), customer);
    await expect(
      advanceOrder(order.id, "READY", paid.version, kitchen),
    ).rejects.toThrow("stage");
    const started = await advanceOrder(
      order.id,
      "PREPARING",
      paid.version,
      kitchen,
    );
    await expect(
      advanceOrder(order.id, "READY", paid.version, kitchen),
    ).rejects.toThrow("changed");
    await expect(
      advanceOrder(order.id, "CANCELLED", started.version, customer),
    ).rejects.toThrow("not yet");
    const ready = await advanceOrder(
      order.id,
      "READY",
      started.version,
      kitchen,
    );
    const done = await advanceOrder(
      order.id,
      "HANDED_OFF",
      ready.version,
      kitchen,
    );
    expect(done.status).toBe("HANDED_OFF");
    expect(done.readyAt).not.toBeNull();
  });
  it("cancels before preparation and refunds the simulated charge", async () => {
    const order = await checkout(input(), customer);
    const paid = await payOrder(order.id, payment(), customer);
    await advanceOrder(order.id, "CANCELLED", paid.version, customer);
    expect((await getOrder(order.id, customer)).paymentStatus).toBe("REFUNDED");
  });
  it("persists only one late alert and audits a manager override", async () => {
    const order = await checkout(input(), customer);
    await payOrder(order.id, payment(), customer);
    await db.order.update({
      where: { id: order.id },
      data: { promisedAt: new Date(Date.now() - 11 * 60000) },
    });
    await Promise.all([runOrderJobs(), runOrderJobs()]);
    expect(
      await db.message.count({ where: { orderId: order.id, kind: "LATE" } }),
    ).toBe(1);
    const latest = await getOrder(order.id, customer);
    await changePromise(
      order.id,
      30,
      "A fresh batch is being prepared",
      latest.version,
      manager,
    );
    expect(
      await db.audit.count({
        where: { orderId: order.id, action: "PROMISE_OVERRIDE" },
      }),
    ).toBe(1);
    expect(
      (await getOrder(order.id, customer)).messages.some((m) =>
        m.kind.startsWith("OVERRIDE"),
      ),
    ).toBe(true);
  });
});
