import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/lib/db";
import { getAnalytics, reportDays } from "../../src/lib/analytics";
import type { AuthUser } from "../../src/lib/auth";

let admin: AuthUser, manager: AuthUser, customer: AuthUser;
const now = new Date("2029-04-20T18:00:00Z");
beforeAll(async () => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`) throw new Error("Isolated test database required");
  admin = await db.user.findUniqueOrThrow({ where: { id: "demo-admin" }, include: { outlet: true } });
  manager = await db.user.findUniqueOrThrow({ where: { id: "demo-manager" }, include: { outlet: true } });
  customer = await db.user.create({ data: { id: "analytics-test-customer", email: "analytics@deccan.example", name: "Report test", passwordHash: "test-only" }, include: { outlet: true } });
  await db.order.createMany({ data: Array.from({ length: 106 }, (_, i) => ({
    id: `analytics-${i}`, number: `REPORT-TEST-${i}`, userId: customer.id, outletId: i === 105 ? "kukatpally" : "kondapur", checkoutKey: `report-${i}`, cartHash: "test",
    status: "HANDED_OFF", paymentStatus: "PAID", totalPaise: 10000, subtotalPaise: 10000, gstPaise: 476, workMinutes: 10, fulfillment: "pickup", address: "", phone: "9000000000", note: "Report test",
    createdAt: new Date("2029-04-20T17:00:00Z"), placedAt: new Date("2029-04-20T17:05:00Z"), readyAt: new Date("2029-04-20T17:25:00Z"), expiresAt: now,
  })) });
});
afterAll(async () => {
  await db.order.deleteMany({ where: { userId: "analytics-test-customer" } });
  await db.user.deleteMany({ where: { id: "analytics-test-customer" } });
  await db.$disconnect();
});
describe("database report totals", () => {
  it("counts beyond 100 rows, unique repeat customers, paid revenue and preparation after payment", async () => {
    const report = await getAnalytics(admin, "all", 1, now);
    expect(report.summary.orders).toBe(106);
    expect(report.summary.revenuePaise).toBe(1060000);
    expect(report.summary.customers).toBe(1);
    expect(report.summary.repeatCustomers).toBe(1);
    expect(report.summary.averagePrepMinutes).toBe(20);
    expect(report.byOutlet.find(o => o.id === "kondapur")?.orders).toBe(105);
    expect(report.byOutlet.find(o => o.id === "kukatpally")?.repeatCustomers).toBe(0);
    expect(report.daily).toEqual([{ date: "2029-04-20", orders: 106, revenuePaise: 1060000 }]);
  });
  it("scopes managers, rejects cross-outlet access, and handles empty periods", async () => {
    expect((await getAnalytics(manager, null, 1, now)).summary.orders).toBe(105);
    await expect(getAnalytics(manager, "all", 1, now)).rejects.toThrow("central access");
    await expect(getAnalytics(manager, "kukatpally", 1, now)).rejects.toThrow("outside");
    await expect(getAnalytics(customer, null, 1, now)).rejects.toThrow("Staff");
    expect((await getAnalytics(admin, "all", 1, new Date("2032-01-01T00:00:00Z"))).summary.orders).toBe(0);
    expect(() => reportDays("365")).toThrow("1, 7 or 30");
  });
});
