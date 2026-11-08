import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError, rateLimit } from "./auth";
import { db, serializable } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { CommunicationError, communicationCapabilities, emailProvider, sendEmail } from "./communications";
import { otpVerifySchema } from "./phone-otp";
import { optionalPhoneSchema } from "./validation";

export const emailOtpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(150).refine((value) => !/\.(invalid|example)$/.test(value), "Use an email address that can receive mail"),
  name: z.string().trim().min(2).max(70), consent: z.literal(true), marketingOptIn: z.boolean().default(false),
  purpose: z.enum(["sign_in", "verify_contact"]).default("sign_in"),
}).strict();
export const emailRegistrationRequestSchema = emailOtpRequestSchema.omit({ purpose: true }).extend({ phone: optionalPhoneSchema });
export const emailRegistrationVerifySchema = otpVerifySchema.extend({ password: z.string().min(10).max(128) }).strict();

export async function requestEmailRegistration(input: z.input<typeof emailRegistrationRequestSchema>) {
  const parsed = emailRegistrationRequestSchema.parse(input);
  return requestEmailOtp(parsed, undefined, true, parsed.phone);
}
export async function verifyEmailRegistration(input: z.infer<typeof emailRegistrationVerifySchema>) {
  return verifyEmailOtp({ challengeId: input.challengeId, code: input.code }, undefined, { registrationPassword: input.password });
}

export async function requestEmailOtp(input: z.input<typeof emailOtpRequestSchema>, userId?: string, registration = false, registrationPhone?: string) {
  if (!communicationCapabilities().emailCode) throw new AppError(503, "Email codes are not enabled. Please use password sign-in.");
  const purpose = registration ? "registration" : input.purpose || "sign_in";
  if (purpose === "verify_contact" && !userId) throw new AppError(401, "Please sign in to verify a contact.");
  const demo = process.env.DEMO_MODE === "true", id = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date(), expiresAt = new Date(now.getTime() + 5 * 60_000);
  await rateLimit(`email-otp:request:${input.email}`, 5);
  await rateLimit("email-otp:request:all", 200);
  await serializable(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`email-otp:${input.email}`}))`;
    if (registration && await tx.user.findUnique({ where: { email: input.email }, select: { id: true } }))
      throw new AppError(409, "This email already has an account. Sign in instead.");
    if (registrationPhone && await tx.user.findUnique({ where: { phone: registrationPhone }, select: { id: true } }))
      throw new AppError(409, "This mobile number is already linked to an account. Sign in instead.");
    await tx.emailOtp.deleteMany({ where: { email: input.email } });
    await tx.emailOtp.create({ data: { id, email: input.email, name: input.name, consentAt: now,
      marketingOptIn: input.marketingOptIn, purpose, userId: purpose === "verify_contact" ? userId : null,
      codeHash: hashPassword(`${id}:${input.email}:${code}`), provider: demo ? "demo" : emailProvider(), expiresAt,
      registrationPhone: registration ? registrationPhone : null,
    } });
  });
  if (!demo) {
    try { await sendEmail(input.email, registration ? "Verify your Deccan Kitchen email" : "Your Deccan Kitchen sign-in code",
      `Your code is ${code}. ${registration ? "Enter it to verify your email and create your account. " : ""}It expires in five minutes and can be used once. If you did not request this code, ignore this email.`, `otp/${id}`); }
    catch (error) {
      await db.emailOtp.deleteMany({ where: { id } });
      if (error instanceof CommunicationError && !error.retryable && !error.uncertain)
        throw new AppError(503, "Email verification is unavailable for this address. Please contact support for access, or sign in to an existing account.");
      throw new AppError(503, "The email code could not be sent. Please wait and request another code.");
    }
  }
  return { challengeId: id, expiresAt, ...(demo ? { demoCode: code } : {}), delivery: demo ? "simulated" as const : "email" as const };
}
export async function verifyEmailOtp(input: z.infer<typeof otpVerifySchema>, userId?: string, options?: { registrationPassword: string }) {
  await rateLimit(`email-otp:verify:${input.challengeId}`, 7);
  // The password arrives only alongside the verification code. Persist its hash
  // on the new User after verification; no password is retained in EmailOtp.
  const registrationPasswordHash = options ? hashPassword(options.registrationPassword) : null;
  const result = await serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "EmailOtp" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.emailOtp.findUnique({ where: { id: input.challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5 ||
      (challenge.provider === "demo" && process.env.DEMO_MODE !== "true") ||
      (challenge.provider !== "demo" && process.env.DEMO_MODE === "true") ||
      ((challenge.purpose === "registration") !== Boolean(registrationPasswordHash)) ||
      (challenge.purpose === "verify_contact" && challenge.userId !== userId))
      return { error: "This code expired or was already used. Request a new code." };
    await tx.emailOtp.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    if (!verifyPassword(`${challenge.id}:${challenge.email}:${input.code}`, challenge.codeHash))
      return { error: "Incorrect code. Check the six digits or request a new code." };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`verified-email:${challenge.email}`}))`;
    const existing = await tx.user.findUnique({ where: { email: challenge.email } });
    if (challenge.purpose === "registration") {
      if (existing) return { error: "This email already has an account. Sign in instead." };
      await tx.emailOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      return { user: await tx.user.create({ data: {
        email: challenge.email, name: challenge.name, passwordHash: registrationPasswordHash!,
        phone: challenge.registrationPhone, phoneVerifiedAt: null,
        emailVerifiedAt: challenge.provider === "demo" ? null : new Date(), role: "CUSTOMER",
        consentAt: challenge.consentAt, marketingOptIn: challenge.marketingOptIn,
      } }) };
    }
    if (existing && (existing.role !== "CUSTOMER" || existing.deletedAt)) return { error: "This account cannot use customer email codes." };
    if (challenge.purpose === "sign_in" && existing?.phoneVerifiedAt && !existing.emailVerifiedAt)
      return { error: "Sign in with your verified phone, then verify this email in your privacy settings." };
    const verifiedAt = challenge.provider === "demo" ? null : new Date();
    if (challenge.purpose === "verify_contact") {
      if (!userId || challenge.userId !== userId) return { error: "Sign in to the same account to verify this contact." };
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target || target.deletedAt || target.role !== "CUSTOMER" || (existing && existing.id !== userId))
        return { error: "This address cannot be linked to your account." };
      await tx.emailOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      const changed = target.email !== challenge.email;
      if (verifiedAt && !target.emailVerifiedAt && !changed) await tx.session.deleteMany({ where: { userId } });
      return { user: await tx.user.update({ where: { id: userId }, data: { email: challenge.email, emailVerifiedAt: verifiedAt,
        // A newly claimed email must not preserve a pre-registration attacker's password.
        ...(verifiedAt && !target.emailVerifiedAt && !changed ? { passwordHash: "email-only" } : {}),
      } }) };
    }
    if (existing) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${existing.id} FOR UPDATE`;
    const current = existing ? await tx.user.findUnique({ where: { id: existing.id } }) : null;
    if (existing && (!current || current.deletedAt || current.role !== "CUSTOMER" || current.email !== challenge.email))
      return { error: "This account cannot use customer email codes." };
    if (current?.phoneVerifiedAt && !current.emailVerifiedAt)
      return { error: "Sign in with your verified phone, then verify this email in your privacy settings." };
    await tx.emailOtp.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    if (current) {
      if (verifiedAt && !current.emailVerifiedAt) await tx.session.deleteMany({ where: { userId: current.id } });
      return { user: verifiedAt ? await tx.user.update({ where: { id: current.id }, data: { emailVerifiedAt: current.emailVerifiedAt || verifiedAt,
        ...(!current.emailVerifiedAt ? { passwordHash: "email-only", phone: null, phoneVerifiedAt: null } : {}),
      } }) : current };
    }
    return { user: await tx.user.create({ data: { email: challenge.email, name: challenge.name, passwordHash: "email-only",
      emailVerifiedAt: verifiedAt, role: "CUSTOMER", consentAt: challenge.consentAt, marketingOptIn: challenge.marketingOptIn,
    } }) };
  });
  if (result.error || !result.user) throw new AppError(400, result.error || "Request a new code");
  return result.user;
}
