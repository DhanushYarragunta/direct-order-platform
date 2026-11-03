import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { changePromise } from "@/lib/orders";
import { overrideSchema } from "@/lib/validation";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const user = await requireUser(["ADMIN", "MANAGER"]),
      input = await body(request, overrideSchema);
    return changePromise(
      (await context.params).id,
      input.minutes,
      input.reason,
      input.version,
      user,
    );
  });
}
