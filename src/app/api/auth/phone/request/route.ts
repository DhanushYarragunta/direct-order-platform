import { api, body } from "@/lib/http";
import { otpRequestSchema, requestPhoneOtp } from "@/lib/phone-otp";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, otpRequestSchema);
    const user = input.purpose === "verify_contact" ? await requireUser(["CUSTOMER"]) : null;
    return requestPhoneOtp(input, user?.id);
  });
}
