import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { Role } from "@prisma/client";
import { db } from "./db";

export const COOKIE = "company_a_session";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function currentUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: tokenHash(token) },
    include: { user: { include: { outlet: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return null;
  const { passwordHash: _, ...user } = session.user;
  return user;
}
export type AuthUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) throw new AppError(401, "Please sign in to continue");
  if (roles && !roles.includes(user.role))
    throw new AppError(403, "You do not have access to this action");
  return user;
}
export function staffOutlet(user: AuthUser, requested: string) {
  if (user.role !== "ADMIN" && user.outletId !== requested)
    throw new AppError(403, "This outlet is outside your access");
  return requested;
}
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex"),
    expiresAt = new Date(Date.now() + 7 * 86400_000);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (!user || user.deletedAt) throw new AppError(401, "This account is no longer available");
    await tx.session.create({ data: { id: tokenHash(token), userId, expiresAt } });
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.APP_ORIGIN?.startsWith("https://") ?? false,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function logout() {
  const jar = await cookies(),
    token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: tokenHash(token) } });
  jar.delete(COOKIE);
}
export async function rateLimit(key: string, limit = 12) {
  const window = Math.floor(Date.now() / 600000),
    id = tokenHash(`${key}:${window}`);
  const record = await db.rateLimit.upsert({
    where: { key: id },
    create: { key: id, expiresAt: new Date((window + 1) * 600000) },
    update: { hits: { increment: 1 } },
  });
  if (record.hits > limit)
    throw new AppError(
      429,
      "Too many attempts. Please try again in 10 minutes.",
    );
}
