import { Prisma } from "@prisma/client";
import { db } from "./db";
import { orderInclude } from "./orders";

export async function listKitchenOrders(outletId: string, now = new Date()) {
  // History must never displace a ticket that still needs kitchen action.
  // One snapshot also avoids losing or duplicating a ticket during handoff.
  const [active, recent] = await db.$transaction([
    db.order.findMany({
      where: { outletId, OR: [
        { status: { in: ["PLACED", "PREPARING", "READY"] } },
        { fulfillment: "delivery", status: { in: ["HANDED_OFF", "OUT_FOR_DELIVERY"] } },
      ] },
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    db.order.findMany({
      where: {
        outletId,
        OR: [
          { status: { in: ["DELIVERED", "CANCELLED"] } },
          { status: "HANDED_OFF", fulfillment: "pickup" },
        ],
        createdAt: { gte: new Date(now.getTime() - 24 * 3600000) },
      },
      include: orderInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  return [...active, ...recent].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id),
  );
}
