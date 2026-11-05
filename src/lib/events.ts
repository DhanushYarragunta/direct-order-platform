import { db } from "./db";
import { createEventHub } from "./event-hub";

function createDatabaseHub() {
  return createEventHub({
    async authorize(audience, members) {
      const ids = [...new Set(members.flatMap((member) => member.sessionId ? [member.sessionId] : []))];
      const sessions = await db.session.findMany({
        where: { id: { in: ids }, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true, user: { select: { role: true, outletId: true } } },
      });
      return new Set(sessions.filter((session) => {
        if (audience.scope === "orders") return session.userId === audience.userId;
        return session.user.role !== "CUSTOMER" &&
          (session.user.role === "ADMIN" || session.user.outletId === audience.outletId);
      }).map((session) => session.id));
    },
    async revision(audience) {
      if (audience.scope === "menu") {
        const [items, stock, outlet] = await Promise.all([
          db.menuItem.aggregate({ _max: { updatedAt: true }, _count: true }),
          db.availability.aggregate({ where: { outletId: audience.outletId }, _max: { updatedAt: true }, _count: true }),
          db.outlet.findUnique({ where: { id: audience.outletId }, select: { updatedAt: true } }),
        ]);
        // Scheduled menu windows also change without a database write.
        return JSON.stringify([items, stock, outlet, Math.floor(Date.now() / 60000)]);
      }
      return JSON.stringify(await db.order.aggregate({
        where: audience.scope === "orders" ? { userId: audience.userId } : { outletId: audience.outletId },
        _max: { updatedAt: true }, _count: true,
      }));
    },
  });
}
const processState = globalThis as unknown as { deccanEventHub?: ReturnType<typeof createDatabaseHub> };
export const eventHub = processState.deccanEventHub ??= createDatabaseHub();
