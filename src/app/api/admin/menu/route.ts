import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { db, serializable } from "@/lib/db";
import { menuSchema } from "@/lib/validation";
export async function GET() {
  return api(async () => {
    await requireUser(["ADMIN"]);
    return {
      items: await db.menuItem.findMany({
        include: { availability: true, cityPrices: { orderBy: { city: "asc" } } },
        orderBy: { name: "asc" },
      }),
      outlets: await db.outlet.findMany({ orderBy: { name: "asc" } }),
    };
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]),
      input = await body(request, menuSchema);
    return serializable(async (tx) => {
      const { cityPrices, ...fields } = input;
      const outlets = await tx.outlet.findMany({ select: { id: true } });
      const item = await tx.menuItem.create({
        data: {
          ...fields,
          cityPrices: { create: cityPrices },
          availability: { create: outlets.map((o) => ({ outletId: o.id })) },
        },
      });
      await tx.audit.create({
        data: { actorId: user.id, action: "MENU_CREATE", detail: item.name },
      });
      return item;
    });
  }, 201);
}
