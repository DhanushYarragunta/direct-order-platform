import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { getBusinessTargets, saveBaseline } from "../../src/lib/business-targets";
import type { AuthUser } from "../../src/lib/auth";

const now = new Date("2031-06-15T12:00:00Z"), since = new Date("2031-05-01T00:00:00Z");
let admin: AuthUser, manager: AuthUser;
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`) throw new Error("Isolated test database required");
  admin = await db.user.findUniqueOrThrow({ where: { id: "demo-admin" }, include: { outlet: true } });
  manager = await db.user.findUniqueOrThrow({ where: { id: "demo-manager" }, include: { outlet: true } });
  for (const id of ["returned", "late", "pending"]) await db.user.create({ data: { id: `cohort-${id}`, email: `cohort-${id}@example.invalid`, name: "Cohort test", passwordHash: "test" } });
  const rows = [
    ["returned", "2031-05-01T10:00:00Z", 20000], ["returned", "2031-05-20T10:00:00Z", 40000],
    ["late", "2031-05-01T10:00:00Z", 80000], ["late", "2031-06-05T10:00:00Z", 100000],
    ["pending", "2031-06-10T10:00:00Z", null],
  ] as const;
  await db.order.createMany({ data: rows.map(([user, at, ms], i) => ({
    id: `cohort-order-${i}`, number: `COHORT-${i}`, userId: `cohort-${user}`, outletId: "kondapur", checkoutKey: `cohort-${i}`, cartHash: "test",
    status: "HANDED_OFF", paymentStatus: "PAID", totalPaise: 10000, gstPaise: 476, workMinutes: 10, fulfillment: "pickup", address: "", phone: "9000000000", note: "",
    createdAt: new Date(at), placedAt: new Date(at), expiresAt: now, checkoutDurationMs: ms, checkoutMetricSource: "demo",
  })) });
});
afterAll(async () => {
  await db.channelBaseline.deleteMany({ where: { source: "Cohort test aggregate" } });
  await db.order.deleteMany({ where: { id: { startsWith: "cohort-order-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "cohort-" } } }); await db.$disconnect();
});
describe("business targets use exact denominators", () => {
  it("excludes immature customers and returns beyond 30 days; records median only for measured samples", async () => {
    const report = await getBusinessTargets("kondapur", since, now);
    expect(report.retention.find(row => row.month === "2031-05")).toEqual({ month: "2031-05", eligible: 2, returned: 1, pending: 0 });
    expect(report.retention.find(row => row.month === "2031-06")).toEqual({ month: "2031-06", eligible: 0, returned: 0, pending: 1 });
    expect(report.checkout).toMatchObject({ samples: 4, medianMs: 60000, under60: 2 });
  });
  it("matches app baseline to exact outlet and period, prevents overlaps and scopes writes", async () => {
    const input = { outletId: "kondapur", periodStart: "2031-05-01T00:00:00Z", periodEnd: "2031-06-01T00:00:00Z", appOrders: 25, source: "Cohort test aggregate" };
    await saveBaseline(admin, input, now);
    const report = await getBusinessTargets("kondapur", since, now);
    expect(report.baselines[0]).toMatchObject({ appOrders: 25, directOrders: 3 });
    await expect(saveBaseline(admin, { ...input, periodStart: "2031-05-15T00:00:00Z" }, now)).rejects.toThrow("overlaps");
    await expect(saveBaseline(manager, { ...input, outletId: "kukatpally" }, now)).rejects.toThrow("outside");
    await saveBaseline(manager, { ...input, appOrders: 30 }, now);
    expect((await getBusinessTargets("kondapur", since, now)).baselines[0].appOrders).toBe(30);
  });
});
