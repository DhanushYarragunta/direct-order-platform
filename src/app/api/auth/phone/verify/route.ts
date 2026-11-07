import { AppError, createSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { otpVerifySchema, verifyPhoneOtp } from "@/lib/phone-otp";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, otpVerifySchema);
    const challenge = await db.phoneOtp.findUnique({ where: { id: input.challengeId }, select: { purpose: true, userId: true } });
    if (!challenge || challenge.purpose !== "verify_contact") throw new AppError(400, "Use the password recovery form to reset your password.");
    const current = await requireUser(["CUSTOMER"]);
    const user = await verifyPhoneOtp(input, current.id);
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
