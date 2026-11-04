import { Prisma } from "@prisma/client";
import { AppError, staffOutlet, type AuthUser } from "./auth";
import { db } from "./db";

export type Metrics = {
  orders: number;
  paidOrders: number;
  revenuePaise: number;
  cancelled: number;
  expired: number;
  active: number;
  prepared: number;
  averagePrepMinutes: number | null;
  customers: number;
  repeatCustomers: number;
};
export type AnalyticsData = {
  days: number;
  since: string;
  until: string;
  summary: Metrics;
  outlets: { id: string; name: string }[];
  byOutlet: (Metrics & { id: string; name: string })[];
  daily: { date: string; orders: number; revenuePaise: number }[];
};

const empty: Metrics = {
  orders: 0, paidOrders: 0, revenuePaise: 0, cancelled: 0, expired: 0,
  active: 0, prepared: 0, averagePrepMinutes: null, customers: 0, repeatCustomers: 0,
};

export function reportDays(value: string | null) {
  if (value === null) return 7;
  if (!["1", "7", "30"].includes(value)) throw new AppError(400, "Choose a 1, 7 or 30 day report");
  return Number(value);
}

export async function getAnalytics(user: AuthUser, selected: string | null, days: number, now = new Date()): Promise<AnalyticsData> {
  if (!["ADMIN", "MANAGER", "KITCHEN"].includes(user.role)) throw new AppError(403, "Staff access required");
  if (![1, 7, 30].includes(days)) throw new AppError(400, "Invalid reporting period");
  const outletId = selected && selected !== "all" ? selected : user.role === "ADMIN" ? null : user.outletId;
  if (selected === "all" && user.role !== "ADMIN") throw new AppError(403, "All-outlet reports need central access");
  if (outletId) staffOutlet(user, outletId);
  if (!outletId && user.role !== "ADMIN") throw new AppError(403, "No outlet assigned");
  const outlets = await db.outlet.findMany({
    where: user.role === "ADMIN" ? {} : { id: outletId! }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  if (outletId && !outlets.some(o => o.id === outletId)) throw new AppError(404, "Kitchen not found");
  const since = new Date(now.getTime() - days * 86400000);
  const scope = Prisma.sql`"createdAt" >= ${since} AND "createdAt" <= ${now} AND "status" <> 'PENDING_PAYMENT' AND (${outletId}::text IS NULL OR "outletId" = ${outletId})`;
  const [metrics, daily] = await db.$transaction([
    db.$queryRaw<(Metrics & { outletId: string | null })[]>(Prisma.sql`
      WITH base AS (SELECT * FROM "Order" WHERE ${scope}),
      counted AS (
        SELECT *,
          COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID') OVER (PARTITION BY "userId", "outletId") AS outlet_visits,
          COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID') OVER (PARTITION BY "userId") AS all_visits
        FROM base
      )
      SELECT "outletId", COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID')::int AS "paidOrders",
        COALESCE(SUM("totalPaise") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float8 AS "revenuePaise",
        COUNT(*) FILTER (WHERE status = 'CANCELLED' AND "paymentStatus" = 'REFUNDED')::int AS cancelled,
        COUNT(*) FILTER (WHERE status = 'CANCELLED' AND "paymentStatus" <> 'REFUNDED')::int AS expired,
        COUNT(*) FILTER (WHERE status IN ('PLACED', 'PREPARING', 'READY'))::int AS active,
        COUNT(*) FILTER (WHERE "readyAt" IS NOT NULL AND "placedAt" IS NOT NULL)::int AS prepared,
        ROUND(AVG(EXTRACT(EPOCH FROM ("readyAt" - "placedAt")) / 60) FILTER (WHERE "readyAt" >= "placedAt"))::float8 AS "averagePrepMinutes",
        COUNT(DISTINCT "userId") FILTER (WHERE "paymentStatus" = 'PAID')::int AS customers,
        CASE WHEN GROUPING("outletId") = 1
          THEN COUNT(DISTINCT "userId") FILTER (WHERE "paymentStatus" = 'PAID' AND all_visits >= 2)
          ELSE COUNT(DISTINCT "userId") FILTER (WHERE "paymentStatus" = 'PAID' AND outlet_visits >= 2)
        END::int AS "repeatCustomers"
      FROM counted GROUP BY GROUPING SETS (("outletId"), ())
    `),
    db.$queryRaw<AnalyticsData["daily"]>(Prisma.sql`
      SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS orders,
        COALESCE(SUM("totalPaise") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float8 AS "revenuePaise"
      FROM "Order" WHERE ${scope} GROUP BY date ORDER BY date
    `),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return {
    days, since: since.toISOString(), until: now.toISOString(),
    summary: metrics.find(row => row.outletId === null) || empty,
    outlets,
    byOutlet: outlets.filter(o => !outletId || o.id === outletId).map(o => ({ ...empty, ...metrics.find(row => row.outletId === o.id), ...o })),
    daily,
  };
}
