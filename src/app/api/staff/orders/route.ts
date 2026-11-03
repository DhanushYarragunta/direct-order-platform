import { api } from "@/lib/http";
import { AppError, requireUser, staffOutlet } from "@/lib/auth";
import { db } from "@/lib/db";
import { orderInclude } from "@/lib/orders";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER", "KITCHEN"]),
      params = new URL(request.url).searchParams;
    const outletId = params.get("outlet") || user.outletId || "kondapur";
    staffOutlet(user, outletId);
    const outlet = await db.outlet.findUnique({ where: { id: outletId } });
    if (!outlet) throw new AppError(404, "Kitchen not found");
    const outlets = await db.outlet.findMany({
      where: user.role === "ADMIN" ? {} : { id: outletId },
      orderBy: { name: "asc" },
    });
    const since = new Date(Date.now() - 24 * 3600000);
    const orders = await db.order.findMany({
      where: {
        outletId,
        status: { not: "PENDING_PAYMENT" },
        OR: [
          { createdAt: { gte: since } },
          { status: { in: ["PLACED", "PREPARING", "READY"] } },
        ],
      },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { orders, outlet, outlets };
  });
}
