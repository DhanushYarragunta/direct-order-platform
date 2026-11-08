import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const cookieJar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
import { db } from "../../src/lib/db";
import { verifyPassword } from "../../src/lib/password";
import * as communications from "../../src/lib/communications";
import { requestEmailOtp } from "../../src/lib/email-otp";
import { POST as register } from "../../src/app/api/auth/register/route";
import { POST as verifyRegistration } from "../../src/app/api/auth/register/verify/route";
import { POST as verifySignIn } from "../../src/app/api/auth/email/verify/route";

const origin = "http://127.0.0.1:3001";
const password = "registration-test-password!";
const profile = () => ({ email: `signup-${randomUUID()}@customer.test`, name: "New email customer", consent: true as const, marketingOptIn: false });
const request = (path: string, data: unknown) => new Request(`${origin}${path}`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(data),
});
let code = "";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false"); vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("EMAIL_PROVIDER", "resend"); vi.stubEnv("RESEND_API_KEY", "mocked-key");
  vi.stubEnv("EMAIL_FROM", "kitchen@sender.test");
  vi.spyOn(communications, "sendEmail").mockImplementation(async (_to, _subject, body) => {
    code = /Your code is (\d{6})/.exec(body)?.[1] || "";
    return `email-${randomUUID()}`;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });
afterAll(() => db.$disconnect());

async function start(input = profile()) {
  const response = await register(request("/api/auth/register", input));
  expect(response.status).toBe(202);
  return { input, challenge: await response.json() as { challengeId: string }, code };
}
const verify = (challengeId: string, value: string) => verifyRegistration(request("/api/auth/register/verify", { challengeId, code: value, password }));

describe.sequential("email-verified password registration", () => {
  it("creates neither an account nor session until the emailed code is correct", async () => {
    const signup = await start();
    expect(signup.code).toMatch(/^\d{6}$/);
    expect(communications.sendEmail).toHaveBeenCalledWith(signup.input.email, "Verify your Deccan Kitchen email", expect.stringContaining(signup.code), `otp/${signup.challenge.challengeId}`);
    expect(signup.challenge).not.toHaveProperty("demoCode");
    expect(signup.challenge).not.toHaveProperty("role");
    expect(await db.user.findUnique({ where: { email: signup.input.email } })).toBeNull();
    expect(cookieJar.set).not.toHaveBeenCalled();
    const pending = await db.emailOtp.findUniqueOrThrow({ where: { id: signup.challenge.challengeId } });
    expect(pending.purpose).toBe("registration");
    expect(Object.keys(pending).some(key => /password/i.test(key))).toBe(false);
    expect(pending.codeHash).not.toContain(signup.code);
    const wrong = signup.code === "000000" ? "000001" : "000000";
    expect((await verify(signup.challenge.challengeId, wrong)).status).toBe(400);
    expect(await db.user.findUnique({ where: { email: signup.input.email } })).toBeNull();
    expect(cookieJar.set).not.toHaveBeenCalled();
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(201);
    const user = await db.user.findUniqueOrThrow({ where: { email: signup.input.email } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.marketingOptIn).toBe(false);
    expect(verifyPassword(password, user.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(cookieJar.set).toHaveBeenCalledTimes(1);
  });

  it("removes the pending challenge when email sending fails without creating an account", async () => {
    const input = profile();
    vi.mocked(communications.sendEmail).mockRejectedValueOnce(new Error("provider unavailable"));
    expect((await register(request("/api/auth/register", input))).status).toBe(503);
    expect(await db.emailOtp.count({ where: { email: input.email } })).toBe(0);
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("directs rejected email delivery to support without exposing a code or creating an account", async () => {
    const input = profile();
    vi.mocked(communications.sendEmail).mockRejectedValueOnce(new communications.CommunicationError("AWS_REJECTED", false));
    const response = await register(request("/api/auth/register", input));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Email verification is unavailable for this address. Please contact support for access, or sign in to an existing account." });
    expect(await db.emailOtp.count({ where: { email: input.email } })).toBe(0);
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it.each([
    ["AWS_THROTTLED", true, false],
    ["AWS_ACCEPTANCE_UNCERTAIN", false, true],
  ] as const)("keeps temporary recovery guidance for %s and invalidates the unsent code", async (code, retryable, uncertain) => {
    const input = profile();
    vi.mocked(communications.sendEmail).mockRejectedValueOnce(new communications.CommunicationError(code, retryable, uncertain));
    const response = await register(request("/api/auth/register", input));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "The email code could not be sent. Please wait and request another code." });
    expect(await db.emailOtp.count({ where: { email: input.email } })).toBe(0);
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
  });

  it("fails closed without email configuration and rejects passwords in the first signup request", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const input = profile();
    expect((await register(request("/api/auth/register", input))).status).toBe(503);
    expect((await register(request("/api/auth/register", { ...input, password }))).status).toBe(400);
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    expect(communications.sendEmail).not.toHaveBeenCalled();
  });

  it("does not accept registration codes as sign-in codes or sign-in/contact codes as registration", async () => {
    const signup = await start();
    expect((await verifySignIn(request("/api/auth/email/verify", { challengeId: signup.challenge.challengeId, code: signup.code }))).status).toBe(400);
    expect((await db.emailOtp.findUniqueOrThrow({ where: { id: signup.challenge.challengeId } })).consumedAt).toBeNull();
    expect(await db.user.findUnique({ where: { email: signup.input.email } })).toBeNull();
    const signInInput = profile();
    const signIn = await requestEmailOtp(signInInput);
    expect((await verify(signIn.challengeId, code)).status).toBe(400);
    expect(await db.user.findUnique({ where: { email: signInInput.email } })).toBeNull();
    const contactOwner = await db.user.create({ data: { email: profile().email, name: "Existing customer", passwordHash: "unchanged" } });
    const contact = await requestEmailOtp({ ...profile(), purpose: "verify_contact" }, contactOwner.id);
    expect((await verify(contact.challengeId, code)).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: contactOwner.id } })).passwordHash).toBe("unchanged");
    expect(cookieJar.set).not.toHaveBeenCalled();
  });

  it("consumes concurrent correct verifications once and creates one account/session", async () => {
    const signup = await start();
    const responses = await Promise.all([verify(signup.challenge.challengeId, signup.code), verify(signup.challenge.challengeId, signup.code)]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 400]);
    const user = await db.user.findUniqueOrThrow({ where: { email: signup.input.email } });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(400);
  });

  it("does not overwrite an account created while its registration code was in transit", async () => {
    const signup = await start();
    const owner = await db.user.create({ data: { email: signup.input.email, name: "Existing verified owner", passwordHash: "preserved", emailVerifiedAt: new Date() } });
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).passwordHash).toBe("preserved");
    expect(await db.session.count({ where: { userId: owner.id } })).toBe(0);
    vi.mocked(communications.sendEmail).mockClear();
    expect((await register(request("/api/auth/register", signup.input))).status).toBe(409);
    expect(communications.sendEmail).not.toHaveBeenCalled();
  });

  it("enforces five guesses, expiry and resend invalidation before account creation", async () => {
    const signup = await start();
    const wrong = signup.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) expect((await verify(signup.challenge.challengeId, wrong)).status).toBe(400);
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(400);
    const expired = await start();
    await db.emailOtp.update({ where: { id: expired.challenge.challengeId }, data: { expiresAt: new Date(0) } });
    expect((await verify(expired.challenge.challengeId, expired.code)).status).toBe(400);
    const resend = await start();
    const replacement = await start(resend.input);
    expect((await verify(resend.challenge.challengeId, resend.code)).status).toBe(400);
    expect((await verify(replacement.challenge.challengeId, replacement.code)).status).toBe(201);
    expect(await db.user.findUnique({ where: { email: signup.input.email } })).toBeNull();
    expect(await db.user.findUnique({ where: { email: expired.input.email } })).toBeNull();
  });

  it("preserves explicitly simulated demo registration without claiming verified ownership", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const input = profile();
    expect((await register(request("/api/auth/register", { ...input, password }))).status).toBe(201);
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(communications.sendEmail).not.toHaveBeenCalled();
  });

  it("normalizes optional signup mobile without claiming SMS ownership", async () => {
    const mobile = `7${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const input = { ...profile(), phone: `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}` };
    const signup = await start(input);
    expect(await db.user.findUnique({ where: { phone: mobile } })).toBeNull();
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(201);
    const user = await db.user.findUniqueOrThrow({ where: { email: input.email } });
    expect(user.phone).toBe(mobile);
    expect(user.phoneVerifiedAt).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
  });

  it("never replaces an existing mobile binding during signup or while its code is pending", async () => {
    const mobile = `7${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
    const input = { ...profile(), phone: mobile };
    const signup = await start(input);
    const owner = await db.user.create({ data: { email: profile().email, phone: mobile, phoneVerifiedAt: new Date(), name: "Mobile owner", passwordHash: "preserved" } });
    expect((await verify(signup.challenge.challengeId, signup.code)).status).toBe(409);
    expect(await db.user.findUnique({ where: { email: input.email } })).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { phone: mobile } })).id).toBe(owner.id);
    expect((await register(request("/api/auth/register", { ...profile(), phone: mobile }))).status).toBe(409);
    expect(cookieJar.set).not.toHaveBeenCalled();
  });
});
