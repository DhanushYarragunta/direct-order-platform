import { api, body } from "@/lib/http";
import { AppError, requireUser } from "@/lib/auth";
import { emailOtpRequestSchema, requestEmailOtp } from "@/lib/email-otp";
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, emailOtpRequestSchema);
    if (input.purpose !== "verify_contact") throw new AppError(410, "Sign in with your password, or use Forgot password to recover access.");
    const user = await requireUser(["CUSTOMER"]);
    return requestEmailOtp(input, user.id);
  });
}
