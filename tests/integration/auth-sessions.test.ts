import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
const cookieJar = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieJar }));
import { db } from "../../src/lib/db";
import { createSession, currentUser, SESSION_DURATION_MS } from "../../src/lib/auth";
import { hashPassword, verifyPassword } from "../../src/lib/password";

beforeAll(() => {
  if (!process.env.CORE_TEST_DATABASE?.startsWith("deccan_test_") || new URL(process.env.DATABASE_URL!).pathname !== `/${process.env.CORE_TEST_DATABASE}`)
    throw new Error("Refusing tests outside an isolated core test database.");
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
afterAll(() => db.$disconnect());

it("persists sign-in for 15 days and expires without extending on ordinary visits", async () => {
  const user = await db.user.create({ data: { email: `session-duration-${randomUUID()}@customer.test`, name: "Persistent session", passwordHash: hashPassword("persistent-test-password") } });
  const signedInAt = new Date();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(signedInAt);
  await createSession(user.id, user.passwordHash);
  const [, token, options] = cookieJar.set.mock.calls[0];
  cookieJar.get.mockReturnValue({ value: token });
  const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
  expect(SESSION_DURATION_MS).toBe(15 * 24 * 60 * 60 * 1000);
  expect(session.expiresAt.getTime()).toBe(signedInAt.getTime() + SESSION_DURATION_MS);
  expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", expires: session.expiresAt });
  vi.setSystemTime(new Date(session.expiresAt.getTime() - 1));
  expect((await currentUser())?.id).toBe(user.id);
  expect((await db.session.findUniqueOrThrow({ where: { id: session.id } })).expiresAt).toEqual(session.expiresAt);
  vi.setSystemTime(session.expiresAt);
  expect(await currentUser()).toBeNull();
});

it("rejects an in-flight password login after recovery invalidates its verified credential", async () => {
  const password = "test-only-original-password";
  const user = await db.user.create({ data: { email: `session-race-${randomUUID()}@customer.test`, name: "Session race", passwordHash: hashPassword(password) } });
  // The password request has already authenticated this snapshot before recovery.
  expect(verifyPassword(password, user.passwordHash)).toBe(true);
  let release!: () => void, locked!: () => void, recoveryPid = 0;
  const keepLock = new Promise<void>(resolve => { release = resolve; });
  const lockReady = new Promise<void>(resolve => { locked = resolve; });
  const recovery = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
    recoveryPid = (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: "email-only", emailVerifiedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    locked();
    await keepLock;
  }, { timeout: 10000 });
  await lockReady;
  const staleSignIn = createSession(user.id, user.passwordHash).then(
    () => ({ ok: true as const }), error => ({ ok: false as const, error }),
  );
  try {
    let blocked = false;
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const waiters = await db.$queryRaw<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE ${recoveryPid} = ANY(pg_blocking_pids(pid))`;
      if (waiters[0].count > 0) { blocked = true; break; }
      await delay(10);
    }
    expect(blocked).toBe(true);
  } finally {
    release();
    await recovery;
  }
  const result = await staleSignIn;
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatchObject({ status: 401, message: expect.stringContaining("credentials changed") });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  expect(cookieJar.set).not.toHaveBeenCalled();

  // A freshly verified recovery credential can still establish a new session.
  await createSession(user.id, "email-only");
  expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  expect(cookieJar.set).toHaveBeenCalledTimes(1);
});

it("recovery revokes a session that finished before the credential change", async () => {
  const user = await db.user.create({ data: { email: `session-before-${randomUUID()}@customer.test`, name: "Session before recovery", passwordHash: hashPassword("test-password-before-recovery") } });
  await createSession(user.id, user.passwordHash);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
    await tx.user.update({ where: { id: user.id }, data: { passwordHash: "email-only" } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  await expect(createSession(user.id, user.passwordHash)).rejects.toThrow("credentials changed");
});
