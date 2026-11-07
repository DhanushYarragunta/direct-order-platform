import { AppError, createSession, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { verifyEmailOtp } from "@/lib/email-otp";
import { otpVerifySchema } from "@/lib/phone-otp";
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, otpVerifySchema);
    const challenge = await db.emailOtp.findUnique({ where: { id: input.challengeId }, select: { purpose: true, userId: true } });
    if (!challenge || challenge.purpose !== "verify_contact") throw new AppError(400, "Use the password recovery form to reset your password.");
    const current = await requireUser(["CUSTOMER"]);
    const user = await verifyEmailOtp(input, current.id);
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
