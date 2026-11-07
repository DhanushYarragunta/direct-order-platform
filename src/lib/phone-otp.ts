import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, rateLimit } from "./auth";
import { serializable } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { db } from "./db";
import { checkPhoneVerification, communicationCapabilities, startPhoneVerification, smsProvider, sendSms } from "./communications";

export const otpRequestSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
  name: z.string().trim().min(2).max(70),
  consent: z.literal(true),
  marketingOptIn: z.boolean().default(false),
  purpose: z.enum(["sign_in", "verify_contact"]).default("sign_in"),
}).strict();
export const otpVerifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/, "Enter the six-digit code") }).strict();

function requireOtp() {
  if (!communicationCapabilities().phoneCode) throw new AppError(503,
    "Phone sign-in is not enabled for this service. Please use email sign-in.");
}

export async function requestPhoneOtp(input: z.input<typeof otpRequestSchema>, userId?: string) {
  const purpose = input.purpose || "sign_in";
  requireOtp();
  if (purpose === "verify_contact" && !userId) throw new AppError(401, "Please sign in to verify a contact.");
  const demo = process.env.DEMO_MODE === "true";
  const provider = demo ? "demo" : smsProvider();
  await rateLimit(`otp:request:${input.phone}`, 5);
  await rateLimit("otp:request:all", 200);
  const id = randomUUID(), code = provider !== "twilio" ? randomInt(0, 1_000_000).toString().padStart(6, "0") : null;
  const now = new Date(), expiresAt = new Date(now.getTime() + 5 * 60_000);
  await serializable(async (tx) => {
    // A single latest challenge per phone, including concurrent resend requests.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`otp:${input.phone}`}))`;
    await tx.phoneOtp.deleteMany({ where: { phone: input.phone } });
    await tx.phoneOtp.create({ data: { id, phone: input.phone, name: input.name,
      consentAt: now, marketingOptIn: input.marketingOptIn,
      codeHash: code ? hashPassword(`${id}:${input.phone}:${code}`) : "provider-managed", expiresAt,
      provider, purpose, userId: purpose === "verify_contact" ? userId : null,
    } });
  });
  if (!demo) {
    try {
      const providerId = provider === "twilio" ? await startPhoneVerification(input.phone)
        : await sendSms(input.phone, "", { purpose: "otp", code: code! });
      const updated = await db.phoneOtp.updateMany({ where: { id }, data: { providerId } });
      if (!updated.count) throw new AppError(409, "A newer code was requested. Use your latest request.");
    } catch {
      await db.phoneOtp.deleteMany({ where: { id } });
      throw new AppError(503, "The SMS code could not be sent. Please wait and request another code.");
    }
  }
  return { challengeId: id, expiresAt, ...(demo ? { demoCode: code! } : {}), delivery: demo ? "simulated" as const : "sms" as const };
}

export async function verifyPhoneOtp(input: z.infer<typeof otpVerifySchema>, userId?: string) {
  requireOtp();
  await rateLimit(`otp:verify:${input.challengeId}`, 7);
  // Persist the attempt before calling an external service. Never replay a Verify
  // request inside an automatically retried serializable transaction.
  const reserved = await serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PhoneOtp" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.phoneOtp.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5 ||
      (challenge.provider === "demo" && process.env.DEMO_MODE !== "true") ||
      (challenge.provider !== "demo" && process.env.DEMO_MODE === "true") ||
      (challenge.provider !== "demo" && challenge.provider !== smsProvider()) ||
      (challenge.purpose === "verify_contact" && challenge.userId !== userId)) return null;
    await tx.phoneOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return challenge;
  });
  if (!reserved) throw new AppError(400, "This code expired or was already used. Request a new code.");
  let approved = false;
  try {
    approved = reserved.provider !== "twilio"
      ? verifyPassword(`${reserved.id}:${reserved.phone}:${input.code}`, reserved.codeHash)
      : !!reserved.providerId && await checkPhoneVerification(reserved.providerId, input.code);
  } catch { throw new AppError(503, "The code could not be checked. Try again or request a new code."); }
  if (!approved) throw new AppError(400, "Incorrect code or expired code. Check the six digits or request a new code.");
  const result = await serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "PhoneOtp" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.phoneOtp.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date())
      return { error: "This code expired or was already used. Request a new code." };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`verified-phone:${challenge.phone}`}))`;
    const existing = await tx.user.findUnique({ where: { phone: challenge.phone } });
    if (existing && (existing.role !== "CUSTOMER" || existing.deletedAt))
      return { error: "This account cannot use customer phone sign-in." };
    const verifiedAt = challenge.provider === "demo" ? null : new Date();
    if (challenge.purpose === "verify_contact") {
      if (!userId || userId !== challenge.userId) return { error: "Sign in to the same account to verify this contact." };
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target || target.deletedAt || target.role !== "CUSTOMER" || (existing && existing.id !== userId))
        return { error: "This number cannot be linked to your account." };
      await tx.phoneOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      return { user: await tx.user.update({ where: { id: userId }, data: { phone: challenge.phone, phoneVerifiedAt: verifiedAt } }) };
    }
    if (existing) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${existing.id} FOR UPDATE`;
    const current = existing ? await tx.user.findUnique({ where: { id: existing.id } }) : null;
    if (existing && (!current || current.deletedAt || current.role !== "CUSTOMER" || current.phone !== challenge.phone))
      return { error: "This account cannot use customer phone sign-in." };
    await tx.phoneOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    const user = current ? (verifiedAt ? await tx.user.update({ where: { id: current.id }, data: { phoneVerifiedAt: current.phoneVerifiedAt || verifiedAt } }) : current) : await tx.user.create({ data: {
      name: challenge.name, phone: challenge.phone,
      email: `phone-${randomUUID()}@account.invalid`, passwordHash: "phone-only",
      role: "CUSTOMER", consentAt: challenge.consentAt, marketingOptIn: challenge.marketingOptIn,
      phoneVerifiedAt: verifiedAt,
    } });
    return { user };
  });
  // Throw after commit, so failed guesses consume their attempt allowance.
  if (result.error || !result.user) throw new AppError(400, result.error || "Request a new code");
  return result.user;
}
