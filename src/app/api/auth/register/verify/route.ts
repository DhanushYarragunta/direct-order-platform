import { createSession } from "@/lib/auth";
import { api, body } from "@/lib/http";
import { emailRegistrationVerifySchema, verifyEmailRegistration } from "@/lib/email-otp";

export async function POST(request: Request) {
  return api(async () => {
    const input = await body(request, emailRegistrationVerifySchema);
    const user = await verifyEmailRegistration(input);
    await createSession(user.id, user.passwordHash);
    return { ok: true, role: user.role };
  }, 201);
}
