import { createHash, randomInt, randomUUID } from "node:crypto";
import type { PasswordReset, User } from "@prisma/client";
import { z } from "zod";
import { AppError, rateLimit } from "./auth";
import { db, serializable } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { loginIdentifierSchema } from "./validation";
import { otpVerifySchema } from "./phone-otp";
import { checkPhoneVerification, emailConfigured, emailProvider, phoneConfigured, smsProvider, sendEmail, sendSms, startPhoneVerification } from "./communications";

export const passwordResetRequestSchema = z.object({ identifier: loginIdentifierSchema }).strict();
export const passwordResetVerifySchema = otpVerifySchema.extend({ password: z.string().min(10).max(128) }).strict();
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const invalidCode = "This code is incorrect, expired or already used. Request a new code.";
const resetProvider = (channel: string) => channel === "email" ? emailProvider() : smsProvider();
export function passwordResetCapabilities() {
  const live = process.env.DEMO_MODE !== "true";
  return { passwordResetEmail: live && emailConfigured(), passwordResetPhone: live && phoneConfigured() };
}

function ownsContact(user: User | null, channel: string, contactHash: string) {
  if (!user || user.deletedAt) return false;
  const contact = channel === "email" ? user.email : user.phone;
  const verified = channel === "email" ? user.emailVerifiedAt : user.phoneVerifiedAt;
  return !!contact && !!verified && fingerprint(contact) === contactHash;
}
function unchangedOwner(user: User | null, challenge: PasswordReset) {
  return ownsContact(user, challenge.channel, challenge.contactHash) &&
    user!.id === challenge.userId && user!.role === challenge.roleSnapshot &&
    fingerprint(user!.passwordHash) === challenge.credentialVersion;
}

/** The public result never confirms an account. Every accepted request stores a
 * hashed challenge, including unknown/unverified contacts. Transport runs only
 * after the HTTP response, so provider latency cannot disclose account existence. */
export async function requestPasswordReset(identifier: string) {
  identifier = loginIdentifierSchema.parse(identifier);
  const channel = identifier.includes("@") ? "email" as const : "sms" as const;
  const capabilities = passwordResetCapabilities();
  if (!(channel === "email" ? capabilities.passwordResetEmail : capabilities.passwordResetPhone))
    throw new AppError(503, channel === "email" ? "Email password recovery is not enabled. Please contact support."
      : "SMS password recovery is not enabled. Use your verified email address or contact support.");
  await rateLimit(`password-reset:request:${identifier}`, 4);
  await rateLimit("password-reset:request:all", 100);
  const id = randomUUID(), code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const contactHash = fingerprint(identifier), now = new Date(), expiresAt = new Date(now.getTime() + 300_000);
  const codeHash = hashPassword(`${id}:${contactHash}:${code}`), provider = resetProvider(channel);
  await serializable(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${contactHash}`}))`;
    let user = await tx.user.findUnique({ where: channel === "email" ? { email: identifier } : { phone: identifier } });
    if (user) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
      user = await tx.user.findUnique({ where: { id: user.id } });
    }
    const eligible = ownsContact(user, channel, contactHash);
    await tx.passwordReset.deleteMany({ where: { OR: [
      { contactHash }, ...(eligible ? [{ userId: user!.id }] : []),
    ] } });
    await tx.passwordReset.create({ data: { id, channel, contactHash, codeHash, provider, expiresAt,
      userId: eligible ? user!.id : null, roleSnapshot: eligible ? user!.role : null,
      credentialVersion: eligible ? fingerprint(user!.passwordHash) : null,
    } });
  });
  return {
    response: { challengeId: id, expiresAt, delivery: channel },
    deliver: async () => {
      try {
        const stored = await db.passwordReset.findUnique({ where: { id } });
        if (!stored?.userId) return;
        // Never retry this transaction around a provider call. Holding the user
        // lock also prevents account erasure completing while a code is sent.
        await db.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${stored.userId} FOR UPDATE`;
          await tx.$queryRaw`SELECT "id" FROM "PasswordReset" WHERE "id"=${id} FOR UPDATE`;
          const challenge = await tx.passwordReset.findUnique({ where: { id } });
          const user = await tx.user.findUnique({ where: { id: stored.userId! } });
          if (!challenge || challenge.consumedAt || challenge.sentAt || challenge.expiresAt <= new Date() ||
            process.env.DEMO_MODE === "true" || challenge.provider !== resetProvider(channel) || !unchangedOwner(user, challenge)) return;
          const providerId = channel === "email" ? await sendEmail(user!.email, "Reset your Deccan Kitchen password",
            `Your code is ${code}. Enter it to reset your password. It expires in five minutes and can be used once. If you did not request this reset, ignore this email.`, `password-reset/${id}`)
            : provider === "twilio" ? await startPhoneVerification(user!.phone!)
              : await sendSms(user!.phone!, "", { purpose: "otp", code });
          await tx.passwordReset.update({ where: { id }, data: { providerId, sentAt: new Date() } });
        }, { timeout: 15_000, maxWait: 5000 });
      } catch {
        // A failed/uncertain send cannot turn into a usable reset challenge, and
        // no provider response or OTP is logged or returned to the requester.
        await db.passwordReset.updateMany({ where: { id }, data: { consumedAt: new Date() } }).catch(() => {});
      }
    },
  };
}

export async function verifyPasswordReset(input: z.infer<typeof passwordResetVerifySchema>) {
  await rateLimit(`password-reset:verify:${input.challengeId}`, 7);
  const reserved = await serializable(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "PasswordReset" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.passwordReset.findUnique({ where: { id: input.challengeId } });
    if (!challenge?.userId || !challenge.sentAt || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5 ||
      process.env.DEMO_MODE === "true" || challenge.provider !== resetProvider(challenge.channel)) return null;
    await tx.passwordReset.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return challenge;
  });
  if (!reserved) throw new AppError(400, invalidCode);
  let approved = false;
  try {
    approved = reserved.channel === "sms" && reserved.provider === "twilio"
      ? !!reserved.providerId && await checkPhoneVerification(reserved.providerId, input.code)
      : verifyPassword(`${reserved.id}:${reserved.contactHash}:${input.code}`, reserved.codeHash);
  } catch { throw new AppError(503, "The code could not be checked. Try again or request a new code."); }
  if (!approved) throw new AppError(400, invalidCode);
  const passwordHash = hashPassword(input.password);
  const changed = await serializable(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${reserved.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "PasswordReset" WHERE "id"=${input.challengeId} FOR UPDATE`;
    const challenge = await tx.passwordReset.findUnique({ where: { id: input.challengeId } });
    const user = await tx.user.findUnique({ where: { id: reserved.userId! } });
    if (!challenge || challenge.consumedAt || !challenge.sentAt || challenge.expiresAt <= new Date() ||
      process.env.DEMO_MODE === "true" || challenge.provider !== resetProvider(challenge.channel) || !unchangedOwner(user, challenge)) return false;
    await tx.user.update({ where: { id: user!.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user!.id } });
    await tx.passwordReset.updateMany({ where: { userId: user!.id, consumedAt: null }, data: { consumedAt: new Date() } });
    await tx.audit.create({ data: { actorId: user!.id, action: "PASSWORD_RESET", detail: "Password changed after verification of an existing contact; all sessions revoked." } });
    return true;
  });
  if (!changed) throw new AppError(400, invalidCode);
  return { ok: true };
}
