import { createSession, currentUser } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { otpVerifySchema, verifyPhoneOtp } from "@/lib/phone-otp";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, otpVerifySchema);
    const current = await currentUser();
    const user = await verifyPhoneOtp(input, current?.id);
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
