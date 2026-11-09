import { requireUser, rateLimit } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { customerProfile, updateCustomerProfile } from "@/lib/customer-profile";
import { customerProfileSchema } from "@/lib/profile-validation";

export async function GET() {
  return api(async () => customerProfile((await requireUser()).id));
}

export async function PATCH(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, customerProfileSchema);
    await rateLimit(`profile:update:${user.id}`, 30);
    return updateCustomerProfile(user.id, input);
  });
}
