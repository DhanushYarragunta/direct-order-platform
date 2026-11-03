import { db } from "@/lib/db";
import { api } from "@/lib/http";
import { AppError } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return api(async () => {
    const outlets = await db.outlet.findMany({ orderBy: { name: "asc" } });
    const outletId =
      new URL(request.url).searchParams.get("outlet") || "kondapur";
    const outlet = outlets.find((o) => o.id === outletId);
    if (!outlet) throw new AppError(404, "Kitchen not found");
    const [rows, addOns] = await Promise.all([
      db.menuItem.findMany({
        where: { active: true },
        orderBy: [{ featured: "desc" }, { name: "asc" }],
        include: { availability: { where: { outletId } } },
      }),
      db.addOn.findMany({
        where: { active: true },
        orderBy: { pricePaise: "asc" },
      }),
    ]);
    return {
      outlets,
      outlet,
      items: rows.map(({ availability, ...item }) => ({
        ...item,
        available: outlet.open && availability[0]?.available === true,
      })),
      addOns,
    };
  });
}
