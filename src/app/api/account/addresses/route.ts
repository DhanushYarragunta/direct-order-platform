import { requireUser, rateLimit } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { createSavedAddress, customerAddresses } from "@/lib/customer-profile";
import { savedAddressSchema } from "@/lib/profile-validation";

export async function GET() {
  return api(async () => customerAddresses((await requireUser()).id));
}

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    const input = await body(request, savedAddressSchema);
    await rateLimit(`addresses:write:${user.id}`, 60);
    return createSavedAddress(user.id, input);
  }, 201);
}
