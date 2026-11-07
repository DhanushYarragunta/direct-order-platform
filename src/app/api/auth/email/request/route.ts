import { api, body } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { emailOtpRequestSchema, requestEmailOtp } from "@/lib/email-otp";
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, emailOtpRequestSchema);
    const user = input.purpose === "verify_contact" ? await requireUser(["CUSTOMER"]) : null;
    return requestEmailOtp(input, user?.id);
  });
}
