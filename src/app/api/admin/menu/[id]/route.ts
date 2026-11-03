import { api, body } from "@/lib/http";
import { AppError, requireUser } from "@/lib/auth";
import { serializable } from "@/lib/db";
import { menuSchema } from "@/lib/validation";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]),
      input = await body(request, menuSchema),
      { id } = await context.params;
    return serializable(async (tx) => {
      if (!(await tx.menuItem.findUnique({ where: { id } })))
        throw new AppError(404, "Dish not found");
      const item = await tx.menuItem.update({ where: { id }, data: input });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "MENU_UPDATE",
          detail: `${item.name}: price ${item.pricePaise} paise, active ${item.active}`,
        },
      });
      return item;
    });
  });
}
