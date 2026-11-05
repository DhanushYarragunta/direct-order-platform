import { api, body } from "@/lib/http";
import { otpRequestSchema, requestPhoneOtp } from "@/lib/phone-otp";

export async function POST(request: Request) {
  return api(async () => requestPhoneOtp(await body(request, otpRequestSchema)));
}
