import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getOrder, advanceOrder } from "@/lib/orders";
import { transitionSchema } from "@/lib/validation";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return api(async () =>
    getOrder((await context.params).id, await requireUser()),
  );
}
export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser(),
      input = await body(request, transitionSchema);
    return advanceOrder(
      (await context.params).id,
      input.status,
      input.version,
      user,
    );
  });
}
