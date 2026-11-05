import { AppError, requireUser } from "@/lib/auth";
import { db, serializable } from "@/lib/db";
import { api, body } from "@/lib/http";
import { outletPolicySchema } from "@/lib/outlet-policy";

export async function GET() {
  return api(async () => {
    await requireUser(["ADMIN"]);
    return { outlets: await db.outlet.findMany({ orderBy: { name: "asc" } }) };
  });
}
export async function PATCH(request: Request) {
  return api(async () => {
    const user = await requireUser(["ADMIN"]);
    const { outletId, expectedUpdatedAt, verificationNote, ...fields } = await body(request, outletPolicySchema);
    return serializable(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Outlet" WHERE "id"=${outletId} FOR UPDATE`;
      const previous = await tx.outlet.findUnique({ where: { id: outletId } });
      if (!previous) throw new AppError(404, "Outlet not found");
      if (previous.updatedAt.toISOString() !== expectedUpdatedAt)
        throw new AppError(409, "This outlet changed. Close the editor and reload its settings.");
      const outlet = await tx.outlet.update({ where: { id: outletId }, data: fields });
      await tx.audit.create({ data: { actorId: user.id, action: "OUTLET_POLICY", detail: JSON.stringify({
        outletId, before: Object.fromEntries(Object.keys(fields).map((key) => [key, previous[key as keyof typeof previous]])),
        after: fields, verificationNote,
      }) } });
      return outlet;
    });
  });
}
