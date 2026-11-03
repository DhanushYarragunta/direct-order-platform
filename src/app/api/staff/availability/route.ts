import { z } from "zod";
import { api, body } from "@/lib/http";
import { AppError, requireUser, staffOutlet } from "@/lib/auth";
import { serializable } from "@/lib/db";
const schema = z
  .object({
    itemId: z.string().max(80),
    outletId: z.string().max(80),
    available: z.boolean(),
  })
  .strict();
export async function PATCH(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER", "KITCHEN"]),
      input = await body(request, schema);
    staffOutlet(user, input.outletId);
    return serializable(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Outlet" WHERE "id"=${input.outletId} FOR UPDATE`;
      const found = await tx.availability.findUnique({
        where: {
          outletId_itemId: { outletId: input.outletId, itemId: input.itemId },
        },
      });
      if (!found) throw new AppError(404, "Dish not found in this kitchen");
      const result = await tx.availability.update({
        where: {
          outletId_itemId: { outletId: input.outletId, itemId: input.itemId },
        },
        data: { available: input.available },
      });
      await tx.audit.create({
        data: {
          actorId: user.id,
          action: "STOCK",
          detail: `${input.outletId}/${input.itemId}: ${input.available ? "available" : "sold out"}`,
        },
      });
      return result;
    });
  });
}
