import { createSession } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { otpVerifySchema, verifyPhoneOtp } from "@/lib/phone-otp";

export async function POST(request: Request) {
  return api(async () => {
    const user = await verifyPhoneOtp(await body(request, otpVerifySchema));
    await createSession(user.id);
    return { ok: true, role: user.role };
  });
}
