import { requireUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { cateringCancelSchema } from "@/lib/catering-validation";
import { cancelCatering } from "@/lib/catering";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, cateringCancelSchema);
    const { id } = await context.params;
    return cancelCatering(id, input.version, user);
  });
}
