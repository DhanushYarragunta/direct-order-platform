import { db } from "@/lib/db";
import { api } from "@/lib/http";
import { AppError, currentUser } from "@/lib/auth";
import { menuForOutlet, suggestReorders } from "@/lib/menu-context";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const outlets = await db.outlet.findMany({ orderBy: { name: "asc" } });
    const outletId =
      new URL(request.url).searchParams.get("outlet") || "kondapur";
    const outlet = outlets.find((o) => o.id === outletId);
    if (!outlet) throw new AppError(404, "Kitchen not found");
    const [rows, addOns, user] = await Promise.all([
      db.menuItem.findMany({
        where: { active: true },
        orderBy: [{ featured: "desc" }, { name: "asc" }],
        include: { availability: { where: { outletId } }, cityPrices: true },
      }),
      db.addOn.findMany({
        where: { active: true },
        orderBy: { pricePaise: "asc" },
      }),
      currentUser(),
    ]);
    const now = new Date();
    const items = rows.map(({ availability, ...row }) => {
      const { cityPrices: _, ...item } = menuForOutlet(row, outlet.city, now);
      const available = outlet.open && availability[0]?.available === true && item.scheduleAvailable;
      return {
        ...item,
        available,
        inStock: availability[0]?.available === true,
        unavailableReason: available ? null : !outlet.open ? "Kitchen closed" : !item.scheduleAvailable ? "Outside serving hours" : "Sold out for now",
      };
    });
    const history = user?.role === "CUSTOMER" ? await db.order.findMany({
      where: { userId: user.id, outletId, paymentStatus: "PAID", status: { not: "CANCELLED" } },
      select: { createdAt: true, lines: { select: { itemId: true, quantity: true } } },
      orderBy: { createdAt: "desc" }, take: 50,
    }) : [];
    return {
      outlets,
      outlet,
      items,
      addOns,
      suggestedItemIds: suggestReorders(items, history.flatMap((order) => order.lines.map((line) => ({ ...line, orderedAt: order.createdAt })))),
    };
  });
}
