import { api } from "@/lib/http";
import { AppError, requireUser, staffOutlet } from "@/lib/auth";
import { db } from "@/lib/db";
import { listKitchenOrders } from "@/lib/staff-orders";
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
    const orders = await listKitchenOrders(outletId);
    return { orders, outlet, outlets };
  });
}
