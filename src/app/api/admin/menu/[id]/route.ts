import { api, body } from "@/lib/http";
import { AppError, requireUser } from "@/lib/auth";
import { serializable } from "@/lib/db";
import { menuSchema } from "@/lib/validation";
import { requireStoredPhoto } from "@/lib/media";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]),
      input = await body(request, menuSchema),
      { id } = await context.params;
    await requireStoredPhoto(input.photo);
    return serializable(async (tx) => {
      if (!(await tx.menuItem.findUnique({ where: { id } })))
        throw new AppError(404, "Dish not found");
      const { cityPrices, ...fields } = input;
      const item = await tx.menuItem.update({
        where: { id },
        data: { ...fields, cityPrices: { deleteMany: {}, create: cityPrices } },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "MENU_UPDATE",
          detail: `${item.name}: base price ${item.pricePaise} paise, ${cityPrices.length} city overrides, schedule ${item.menuStartMinute === null ? "all day" : `${item.menuDays.join(",")} ${item.menuStartMinute}–${item.menuEndMinute} IST`}, active ${item.active}`,
        },
      });
      return item;
    });
  });
}
