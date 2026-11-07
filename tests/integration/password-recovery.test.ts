import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const cookies = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
const background = vi.hoisted(() => ({ tasks: [] as (() => Promise<void>)[] }));
vi.mock("next/headers", () => ({ cookies: async () => cookies }));
vi.mock("next/server", async importOriginal => ({
  ...await importOriginal<typeof import("next/server")>(), after: (task: () => Promise<void>) => { background.tasks.push(task); },
}));
import { db } from "../../src/lib/db";
import { hashPassword, verifyPassword } from "../../src/lib/password";
import { createSession } from "../../src/lib/auth";
import * as communications from "../../src/lib/communications";
import { passwordResetCapabilities } from "../../src/lib/password-reset";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as requestReset } from "../../src/app/api/auth/password/request/route";
import { POST as verifyReset } from "../../src/app/api/auth/password/verify/route";
import { POST as legacyEmail } from "../../src/app/api/auth/email/request/route";
import { POST as legacyPhone } from "../../src/app/api/auth/phone/request/route";
import { POST as verifyLegacyEmail } from "../../src/app/api/auth/email/verify/route";
import { POST as verifyLegacyPhone } from "../../src/app/api/auth/phone/verify/route";

const origin = "http://127.0.0.1:3001", oldPassword = "existing-test-password!", newPassword = "replacement-test-password!";
const mails = new Map<string, string>();
const request = (path: string, data: unknown) => new Request(origin + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(data) });
const phone = () => `8${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const user = (extra: Record<string, unknown> = {}) => db.user.create({ data: {
  name: "Password recovery customer", email: `recovery-${randomUUID()}@customer.test`, passwordHash: hashPassword(oldPassword),
  emailVerifiedAt: new Date(), ...extra,
} });
async function flush() { for (const task of background.tasks.splice(0)) await task(); }
async function start(identifier: string) {
  const response = await requestReset(request("/api/auth/password/request", { identifier }));
  expect(response.status).toBe(202);
  const challenge = await response.json() as { challengeId: string; expiresAt: string; delivery: string };
  expect(Object.keys(challenge).sort()).toEqual(["challengeId", "delivery", "expiresAt"]);
  await flush();
  return { ...challenge, code: mails.get(challenge.challengeId) || "" };
}
const verify = (challengeId: string, code: string, password = newPassword) => verifyReset(request("/api/auth/password/verify", { challengeId, code, password }));

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", origin); vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("EMAIL_PROVIDER", "resend"); vi.stubEnv("EMAIL_FROM", "kitchen@sender.test"); vi.stubEnv("RESEND_API_KEY", "mocked-reset-key");
  vi.stubEnv("SMS_PROVIDER", "aws"); vi.stubEnv("AWS_SMS_ORIGINATION_IDENTITY", "");
  vi.spyOn(communications, "sendEmail").mockImplementation(async (_to, _subject, text, key) => {
    mails.set(key.replace("password-reset/", ""), /Your code is (\d{6})/.exec(text)?.[1] || "");
    return `mail-${randomUUID()}`;
  });
});
afterEach(() => { background.tasks.length = 0; mails.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
afterAll(() => db.$disconnect());

describe.sequential("password login and verified-contact recovery", () => {
  it("accepts normalized email or stored mobile plus password and keeps legacy email input", async () => {
    const account = await user({ phone: phone(), phoneVerifiedAt: null });
    for (const input of [{ identifier: `  ${account.email.toUpperCase()}  `, password: oldPassword },
      { identifier: `+91 ${account.phone!.slice(0, 5)} ${account.phone!.slice(5)}`, password: oldPassword },
      { email: account.email, password: oldPassword }]) {
      expect((await login(request("/api/auth/login", input))).status).toBe(200);
    }
    const wrong = await login(request("/api/auth/login", { identifier: account.email, password: "incorrect" }));
    const absent = await login(request("/api/auth/login", { identifier: `${randomUUID()}@customer.test`, password: "incorrect" }));
    expect(wrong.status).toBe(401); expect(await wrong.json()).toEqual(await absent.json());
    const passwordless = await user({ passwordHash: "email-only" });
    expect((await login(request("/api/auth/login", { identifier: passwordless.email, password: "unused-password-for-timing" }))).status).toBe(401);
  });

  it("returns the same generic challenge shape and defers transport for unknown or unverified contacts", async () => {
    const known = await user(), unverified = await user({ emailVerifiedAt: null });
    const response = await requestReset(request("/api/auth/password/request", { identifier: known.email }));
    expect(response.status).toBe(202); expect(communications.sendEmail).not.toHaveBeenCalled();
    await flush();
    const knownBody = await response.json();
    const unknown = await start(`${randomUUID()}@customer.test`), unverifiedResult = await start(unverified.email);
    expect(Object.keys(knownBody).sort()).toEqual(["challengeId", "delivery", "expiresAt"]);
    expect(unknown.delivery).toBe(knownBody.delivery); expect(unverifiedResult.delivery).toBe(knownBody.delivery);
    expect(communications.sendEmail).toHaveBeenCalledTimes(1);
    const saved = await db.passwordReset.findUniqueOrThrow({ where: { id: knownBody.challengeId } });
    expect(saved.codeHash).not.toContain(mails.get(saved.id));
    expect(JSON.stringify(saved)).not.toContain(known.email);
    expect(saved.credentialVersion).not.toBe(known.passwordHash);
    expect((await verify(unknown.challengeId, "123456")).status).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: known.id } })).passwordHash).toBe(known.passwordHash);
  });

  it("changes the password once, revokes every session and requires a fresh explicit login", async () => {
    const account = await user();
    await createSession(account.id, account.passwordHash); await createSession(account.id, account.passwordHash);
    const challenge = await start(account.email); cookies.set.mockClear();
    expect((await verify(challenge.challengeId, challenge.code)).status).toBe(200);
    expect(cookies.set).not.toHaveBeenCalled();
    const changed = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(verifyPassword(newPassword, changed.passwordHash)).toBe(true);
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
    expect((await verify(challenge.challengeId, challenge.code)).status).toBe(400);
    await expect(createSession(account.id, account.passwordHash)).rejects.toThrow("credentials changed");
    expect((await login(request("/api/auth/login", { identifier: account.email, password: oldPassword }))).status).toBe(401);
    expect((await login(request("/api/auth/login", { identifier: account.email, password: newPassword }))).status).toBe(200);
  });

  it("commits five failed guesses, rejects expiry and invalidates a previous request on resend", async () => {
    const account = await user(), challenge = await start(account.email);
    const wrong = challenge.code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) expect((await verify(challenge.challengeId, wrong)).status).toBe(400);
    expect((await db.passwordReset.findUniqueOrThrow({ where: { id: challenge.challengeId } })).attempts).toBe(5);
    expect((await verify(challenge.challengeId, challenge.code)).status).toBe(400);
    const expired = await start(account.email);
    await db.passwordReset.update({ where: { id: expired.challengeId }, data: { expiresAt: new Date(0) } });
    expect((await verify(expired.challengeId, expired.code)).status).toBe(400);
    const previous = await start(account.email), latest = await start(account.email);
    expect((await verify(previous.challengeId, previous.code)).status).toBe(400);
    expect((await verify(latest.challengeId, latest.code)).status).toBe(200);
    expect((await requestReset(request("/api/auth/password/request", { identifier: account.email }))).status).toBe(429);
  });

  it("accepts only one of simultaneous correct redemptions", async () => {
    const account = await user(), challenge = await start(account.email);
    const results = await Promise.all([verify(challenge.challengeId, challenge.code, "concurrent-password-one"), verify(challenge.challengeId, challenge.code, "concurrent-password-two")]);
    expect(results.map(response => response.status).sort()).toEqual([200, 400]);
    expect(await db.audit.count({ where: { actorId: account.id, action: "PASSWORD_RESET" } })).toBe(1);
  });

  it("rejects a challenge after contact, credential, role or deletion changes", async () => {
    for (const change of [{ emailVerifiedAt: null }, { passwordHash: hashPassword("a-new-independent-password") }, { role: "ADMIN" as const }, { deletedAt: new Date() }]) {
      const account = await user(), challenge = await start(account.email);
      await db.user.update({ where: { id: account.id }, data: change });
      expect((await verify(challenge.challengeId, challenge.code)).status).toBe(400);
    }
  });

  it("permits staff recovery only through a preverified contact without changing the role", async () => {
    const staff = await user({ role: "ADMIN" }), unverifiedStaff = await user({ role: "MANAGER", emailVerifiedAt: null });
    const challenge = await start(staff.email); await start(unverifiedStaff.email);
    expect(communications.sendEmail).toHaveBeenCalledTimes(1);
    expect((await verify(challenge.challengeId, challenge.code)).status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).role).toBe("ADMIN");
  });

  it("fails closed in demo or unavailable SMS mode without claiming a code was sent", async () => {
    expect(passwordResetCapabilities()).toMatchObject({ passwordResetEmail: true, passwordResetPhone: false });
    expect((await requestReset(request("/api/auth/password/request", { identifier: phone() }))).status).toBe(503);
    vi.stubEnv("DEMO_MODE", "true");
    const response = await requestReset(request("/api/auth/password/request", { identifier: (await user()).email }));
    expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("demoCode");
    expect(communications.sendEmail).not.toHaveBeenCalled();
  });

  it("does not expose provider failures or leave a failed email challenge usable", async () => {
    const account = await user();
    vi.mocked(communications.sendEmail).mockRejectedValueOnce(new Error("private-provider-response"));
    const response = await requestReset(request("/api/auth/password/request", { identifier: account.email }));
    expect(response.status).toBe(202); const body = await response.json(); await flush();
    expect(JSON.stringify(body)).not.toContain("private-provider-response");
    expect((await db.passwordReset.findUniqueOrThrow({ where: { id: body.challengeId } })).consumedAt).not.toBeNull();
  });

  it("sends AWS SMS only to an already verified phone and consumes its hashed reset code", async () => {
    vi.stubEnv("AWS_REGION", "ap-south-1"); vi.stubEnv("AWS_SMS_ORIGINATION_IDENTITY", "fixture-sender"); vi.stubEnv("AWS_SMS_ENTITY_ID", "fixture-entity");
    vi.stubEnv("AWS_SMS_OTP_TEMPLATE_ID", "fixture-template"); vi.stubEnv("AWS_SMS_OTP_TEMPLATE", "Your code is {{code}}");
    const account = await user({ phone: phone(), phoneVerifiedAt: new Date() }), unverified = await user({ phone: phone(), phoneVerifiedAt: null });
    let smsCode = "";
    const send = vi.spyOn(communications, "sendSms").mockImplementation(async (_phone, _text, context) => { smsCode = context?.purpose === "otp" ? context.code : ""; return "fixture-sms"; });
    const challenge = await start(`+91 ${account.phone}`); await start(unverified.phone!);
    expect(challenge.delivery).toBe("sms"); expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(account.phone);
    expect((await verify(challenge.challengeId, smsCode)).status).toBe(200);
  });

  it("binds Twilio recovery to its exact verification SID and verified phone", async () => {
    vi.stubEnv("SMS_PROVIDER", "twilio"); vi.stubEnv("TWILIO_ACCOUNT_SID", "fixture"); vi.stubEnv("TWILIO_AUTH_TOKEN", "fixture"); vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "fixture");
    const account = await user({ phone: phone(), phoneVerifiedAt: new Date() });
    vi.spyOn(communications, "startPhoneVerification").mockResolvedValue("VE-fixture-exact");
    const check = vi.spyOn(communications, "checkPhoneVerification").mockImplementation(async (id, code) => id === "VE-fixture-exact" && code === "123456");
    const challenge = await start(account.phone!);
    expect((await verify(challenge.challengeId, "654321")).status).toBe(400);
    expect((await verify(challenge.challengeId, "123456")).status).toBe(200);
    expect(check).toHaveBeenCalledWith("VE-fixture-exact", "123456");
  });

  it("disables unauthenticated legacy code sign-in while preserving registration separation", async () => {
    expect((await legacyEmail(request("/api/auth/email/request", { email: (await user()).email, name: "Legacy", consent: true }))).status).toBe(410);
    expect((await legacyPhone(request("/api/auth/phone/request", { phone: phone(), name: "Legacy", consent: true }))).status).toBe(410);
    expect((await verifyLegacyEmail(request("/api/auth/email/verify", { challengeId: randomUUID(), code: "123456" }))).status).toBe(400);
    expect((await verifyLegacyPhone(request("/api/auth/phone/verify", { challengeId: randomUUID(), code: "123456" }))).status).toBe(400);
    expect(communications.sendEmail).not.toHaveBeenCalled(); expect(cookies.set).not.toHaveBeenCalled();
  });
});
