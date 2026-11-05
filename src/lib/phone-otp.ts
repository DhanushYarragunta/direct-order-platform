import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, rateLimit } from "./auth";
import { serializable } from "./db";
import { hashPassword, verifyPassword } from "./password";

export const otpRequestSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  name: z.string().trim().min(2).max(70),
  consent: z.literal(true),
  marketingOptIn: z.boolean().default(false),
}).strict();
export const otpVerifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the six-digit code") }).strict();

function requireDemoOtp() {
  if (process.env.DEMO_MODE !== "true") throw new AppError(503,
    "Phone sign-in is not enabled for this service. Please use email sign-in.");
}

export async function requestPhoneOtp(input: z.infer<typeof otpRequestSchema>) {
  requireDemoOtp();
  await rateLimit(`otp:request:${input.phone}`, 5);
  await rateLimit("otp:request:all", 200);
  const id = randomUUID(), code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date(), expiresAt = new Date(now.getTime() + 5 * 60_000);
  await serializable(async (tx) => {
    // A single latest challenge per phone, including concurrent resend requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`otp:${input.phone}`}))`;
    await tx.phoneOtp.deleteMany({ where: { phone: input.phone } });
    await tx.phoneOtp.create({ data: { id, phone: input.phone, name: input.name,
      consentAt: now, marketingOptIn: input.marketingOptIn,
      codeHash: hashPassword(`${id}:${input.phone}:${code}`), expiresAt,
    } });
  });
  // Only an explicitly enabled demo exposes a code. No SMS delivery is claimed.
  return { challengeId: id, expiresAt, demoCode: code, delivery: "simulated" as const };
}

export async function verifyPhoneOtp(input: z.infer<typeof otpVerifySchema>) {
  requireDemoOtp();
  await rateLimit(`otp:verify:${input.challengeId}`, 7);
  const result = await serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PhoneOtp" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.phoneOtp.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5)
      return { error: "This code expired or was already used. Request a new code." };
    await tx.phoneOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    if (!verifyPassword(`${challenge.id}:${challenge.phone}:${input.code}`, challenge.codeHash))
      return { error: "Incorrect code. Check the six digits or request a new code." };
    const existing = await tx.user.findUnique({ where: { phone: challenge.phone } });
    if (existing && (existing.role !== "CUSTOMER" || existing.deletedAt))
      return { error: "This account cannot use customer phone sign-in." };
    await tx.phoneOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    const user = existing || await tx.user.create({ data: {
      name: challenge.name, phone: challenge.phone,
      email: `phone-${randomUUID()}@account.invalid`, passwordHash: "phone-only",
      role: "CUSTOMER", consentAt: challenge.consentAt, marketingOptIn: challenge.marketingOptIn,
    } });
    return { user };
  });
  // Throw after commit, so failed guesses consume their attempt allowance.
  if (result.error || !result.user) throw new AppError(400, result.error || "Request a new code");
  return result.user;
}
