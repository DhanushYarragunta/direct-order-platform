import { after } from "next/server";
import { api, body } from "@/lib/http";
import { passwordResetRequestSchema, requestPasswordReset } from "@/lib/password-reset";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, passwordResetRequestSchema);
    const reset = await requestPasswordReset(input.identifier);
    after(reset.deliver);
    return reset.response;
  }, 202);
}
