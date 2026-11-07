import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { AppError, createSession, rateLimit } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
const dummy = hashPassword("unused-password-for-timing");
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, loginSchema);
    await rateLimit(`login:${input.identifier}`);
    const user = await db.user.findUnique({ where: input.identifier.includes("@") ? { email: input.identifier } : { phone: input.identifier } });
    const stored = user?.passwordHash;
    const hasPassword = !!stored && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored);
    // Passwordless legacy accounts and absent users still perform one scrypt.
    const valid = verifyPassword(input.password, hasPassword ? stored! : dummy);
    if (!user || user.deletedAt || !hasPassword || !valid)
      throw new AppError(401, "Email, mobile number or password is incorrect");
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
