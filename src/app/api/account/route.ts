import { z } from "zod";
import { cookies } from "next/headers";
import { COOKIE, requireUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { accountPreferences, deleteAccount, updateMarketing } from "@/lib/privacy";

export async function GET() {
  return api(async () => accountPreferences((await requireUser()).id));
}
export async function PATCH(request: Request) {
  return api(async () => {
    const user = await requireUser();
    const input = await body(request, z.object({ marketingOptIn: z.boolean() }).strict());
    return updateMarketing(user.id, input.marketingOptIn);
  });
}
export async function DELETE(request: Request) {
  return api(async () => {
    const user = await requireUser(["CUSTOMER"]);
    await body(request, z.object({ confirmation: z.literal("DELETE") }).strict());
    const result = await deleteAccount(user);
    (await cookies()).delete(COOKIE);
    return result;
  });
}
