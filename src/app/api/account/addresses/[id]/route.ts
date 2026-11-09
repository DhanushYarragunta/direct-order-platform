import { z } from "zod";
import { requireUser, rateLimit } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { deleteSavedAddress, updateSavedAddress } from "@/lib/customer-profile";
import { savedAddressPatchSchema } from "@/lib/profile-validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, savedAddressPatchSchema);
    await rateLimit(`addresses:write:${user.id}`, 60);
    return updateSavedAddress(user.id, (await context.params).id, input);
  });
}

export async function DELETE(request: Request, context: Context) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    await body(request, z.object({}).strict());
    await rateLimit(`addresses:write:${user.id}`, 60);
    return deleteSavedAddress(user.id, (await context.params).id);
  });
}
