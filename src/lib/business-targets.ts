import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError, staffOutlet, type AuthUser } from "./auth";
import { db, serializable } from "./db";

export const baselineSchema = z.object({
  outletId: z.string().min(1).max(80),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  appOrders: z.number().int().min(1).max(10000000),
  source: z.string().trim().min(5).max(160),
}).strict().refine(v => Date.parse(v.periodEnd) > Date.parse(v.periodStart)
  && Date.parse(v.periodEnd) - Date.parse(v.periodStart) <= 366 * 86400000,
{ message: "Choose a baseline period of up to one year with the end after the start" });

export async function saveBaseline(user: AuthUser, input: z.infer<typeof baselineSchema>, now = new Date()) {
  if (!["ADMIN", "MANAGER"].includes(user.role)) throw new AppError(403, "Manager access required");
  staffOutlet(user, input.outletId);
  const periodStart = new Date(input.periodStart), periodEnd = new Date(input.periodEnd);
  if (periodEnd > now) throw new AppError(400, "Use a completed reporting period");
  return serializable(async tx => {
    if (!await tx.outlet.findUnique({ where: { id: input.outletId } })) throw new AppError(404, "Kitchen not found");
    const overlap = await tx.channelBaseline.findFirst({ where: {
      outletId: input.outletId, periodStart: { lt: periodEnd }, periodEnd: { gt: periodStart },
      NOT: { periodStart, periodEnd },
    } });
    if (overlap) throw new AppError(409, "This period overlaps another baseline for this kitchen");
    const baseline = await tx.channelBaseline.upsert({
      where: { outletId_periodStart_periodEnd: { outletId: input.outletId, periodStart, periodEnd } },
      create: { ...input, periodStart, periodEnd },
      update: { appOrders: input.appOrders, source: input.source, recordedAt: now },
    });
    await tx.audit.create({ data: { actorId: user.id, action: "APP_ORDER_BASELINE", detail: `${baseline.id}: ${input.appOrders} app orders; ${input.source}` } });
    return baseline;
  });
}

export type BusinessTargets = {
  demo: boolean;
  checkout: { samples: number; medianMs: number | null; p95Ms: number | null; under60: number };
  retention: { month: string; eligible: number; returned: number; pending: number }[];
  baselines: { id: string; outletId: string; periodStart: string; periodEnd: string; appOrders: number; source: string; directOrders: number }[];
};

export async function getBusinessTargets(outletId: string | null, since: Date, now: Date): Promise<BusinessTargets> {
  const demo = process.env.DEMO_MODE === "true";
  const [checkout, retention, baselines] = await db.$transaction([
    db.$queryRaw<BusinessTargets["checkout"][]>(Prisma.sql`
      SELECT COUNT(*)::int AS samples,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "checkoutDurationMs") AS "medianMs",
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "checkoutDurationMs") AS "p95Ms",
        COUNT(*) FILTER (WHERE "checkoutDurationMs" < 60000)::int AS "under60"
      FROM "Order" WHERE "paymentStatus" = 'PAID' AND "placedAt" >= ${since} AND "placedAt" <= ${now}
        AND "checkoutDurationMs" BETWEEN 0 AND 86400000
        AND "checkoutMetricSource" = ${demo ? "demo" : "browser"}
        AND (${outletId}::text IS NULL OR "outletId" = ${outletId})
    `),
    db.$queryRaw<BusinessTargets["retention"]>(Prisma.sql`
      WITH purchases AS (
        SELECT id, "userId", COALESCE("placedAt", "createdAt") AS at FROM "Order"
        WHERE "paymentStatus" = 'PAID' AND "createdAt" <= ${now}
          AND (${outletId}::text IS NULL OR "outletId" = ${outletId})
      ), firsts AS (SELECT DISTINCT ON ("userId") "userId", id AS first_id, at AS first_at FROM purchases ORDER BY "userId", at, id),
      cohorts AS (
        SELECT f.*, f.first_at <= ${now}::timestamp - INTERVAL '30 days' AS mature,
          EXISTS(SELECT 1 FROM purchases p WHERE p."userId" = f."userId"
            AND p.id <> f.first_id AND p.at >= f.first_at AND p.at <= f.first_at + INTERVAL '30 days' AND p.at <= ${now}) AS returned
        FROM firsts f WHERE f.first_at <= ${now}
      )
      SELECT TO_CHAR(first_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
        COUNT(*) FILTER (WHERE mature)::int AS eligible,
        COUNT(*) FILTER (WHERE mature AND returned)::int AS returned,
        COUNT(*) FILTER (WHERE NOT mature)::int AS pending
      FROM cohorts GROUP BY month ORDER BY month DESC LIMIT 6
    `),
    db.$queryRaw<BusinessTargets["baselines"]>(Prisma.sql`
      SELECT b.id, b."outletId", b."periodStart", b."periodEnd", b."appOrders", b.source,
        (SELECT COUNT(*)::int FROM "Order" o WHERE o."outletId" = b."outletId" AND o."paymentStatus" = 'PAID'
          AND o."placedAt" >= b."periodStart" AND o."placedAt" < b."periodEnd") AS "directOrders"
      FROM "ChannelBaseline" b WHERE (${outletId}::text IS NULL OR b."outletId" = ${outletId})
        AND b."periodEnd" <= ${now} ORDER BY b."periodEnd" DESC, b."outletId" LIMIT 60
    `),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { demo, checkout: checkout[0], retention, baselines };
}
