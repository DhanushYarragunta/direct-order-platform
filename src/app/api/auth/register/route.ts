import { db } from "@/lib/db";
import { api, body } from "@/lib/http";
import { registerSchema } from "@/lib/validation";
import { createSession, rateLimit } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, registerSchema);
    await rateLimit(`register:${input.email}`, 4);
    const user = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: hashPassword(input.password),
        role: "CUSTOMER",
        consentAt: new Date(),
        marketingOptIn: input.marketingOptIn,
      },
    });
    await createSession(user.id);
    return { ok: true, role: user.role };
  }, 201);
}
