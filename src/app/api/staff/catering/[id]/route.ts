import { requireUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { cateringDecisionSchema } from "@/lib/catering-validation";
import { decideCatering } from "@/lib/catering";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER"]);
    const input = await body(request, cateringDecisionSchema);
    const { id } = await context.params;
    return decideCatering(id, input, user);
  });
}
