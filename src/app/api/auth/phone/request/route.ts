import { api, body } from "@/lib/http";
import { otpRequestSchema, requestPhoneOtp } from "@/lib/phone-otp";
import { AppError, requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, otpRequestSchema);
    if (input.purpose !== "verify_contact") throw new AppError(410, "Sign in with your password, or use Forgot password to recover access.");
    const user = await requireUser(["CUSTOMER"]);
    return requestPhoneOtp(input, user.id);
  });
}
