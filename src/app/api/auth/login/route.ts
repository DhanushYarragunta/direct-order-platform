import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { AppError, createSession, rateLimit } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
const dummy = hashPassword("unused-password-for-timing");
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, loginSchema);
    await rateLimit(`login:${input.email}`);
    const user = await db.user.findUnique({ where: { email: input.email } });
    const valid = verifyPassword(input.password, user?.passwordHash || dummy);
    if (!user || user.deletedAt || !valid)
      throw new AppError(401, "Email or password is incorrect");
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  });
}
