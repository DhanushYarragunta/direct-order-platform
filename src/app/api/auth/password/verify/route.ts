import { api, body } from "@/lib/http";
import { passwordResetVerifySchema, verifyPasswordReset } from "@/lib/password-reset";

export async function POST(request: Request) {
  return api(async () => verifyPasswordReset(await body(request, passwordResetVerifySchema)));
}
