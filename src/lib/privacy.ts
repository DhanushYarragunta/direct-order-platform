import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { AppError, type AuthUser } from "./auth";
import { db, serializable } from "./db";

export async function assertAccountActive(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
  if (!user || user.deletedAt) throw new AppError(401, "This account is no longer available");
}

export async function accountPreferences(userId: string) {
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: {
    name: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true, marketingOptIn: true, consentAt: true, createdAt: true,
  } });
}

export async function updateMarketing(userId: string, marketingOptIn: boolean) {
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    await assertAccountActive(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { marketingOptIn } });
    await tx.audit.create({ data: { actorId: userId,
      action: marketingOptIn ? "MARKETING_OPTED_IN" : "MARKETING_WITHDRAWN",
      detail: "Customer updated optional marketing preference from privacy settings.",
    } });
    return { marketingOptIn };
  });
}

export async function exportAccount(userId: string) {
  const [profile, orders, catering, loyalty, consentHistory, addresses] = await db.$transaction([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: {
      id: true, name: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true, role: true, createdAt: true, consentAt: true, marketingOptIn: true,
    } }),
    db.order.findMany({ where: { userId }, include: { lines: true, payments: true, messages: true }, orderBy: { createdAt: "asc" } }),
    db.cateringRequest.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.loyaltyEntry.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.audit.findMany({ where: { actorId: userId, action: { in: ["MARKETING_OPTED_IN", "MARKETING_WITHDRAWN"] } },
      select: { action: true, createdAt: true, detail: true }, orderBy: { createdAt: "asc" } }),
    db.savedAddress.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  return { exportedAt: new Date().toISOString(), profile,
    orders: orders.map(({ checkoutKey: _key, cartHash: _hash, ...order }) => ({ ...order,
      payments: order.payments.map(({ attemptKey: _attempt, ...payment }) => payment),
    })),
    catering: catering.map(({ requestKey: _key, requestHash: _hash, ...request }) => request),
    loyalty, consentHistory, addresses,
  };
}

export async function deleteAccount(user: AuthUser) {
  if (user.role !== "CUSTOMER") throw new AppError(403, "Staff accounts must be managed by the business administrator");
  return serializable(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user.id} FOR UPDATE`;
    await assertAccountActive(tx, user.id);
    const [activeOrders, activeCatering] = await Promise.all([
      tx.order.count({ where: { userId: user.id, OR: [
        { status: { in: ["PENDING_PAYMENT", "PLACED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] } },
        { status: "HANDED_OFF", fulfillment: "delivery" },
      ] } }),
      tx.cateringRequest.count({ where: { userId: user.id, OR: [
        { status: "REQUESTED" }, { status: "CONFIRMED", eventAt: { gte: new Date() } },
      ] } }),
    ]);
    if (activeOrders || activeCatering) throw new AppError(409,
      "Complete or cancel active orders and party requests before deleting your account. Contact the outlet about a confirmed future event.");
    const profile = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    // Recheck the locked account: its role may have changed after authentication.
    if (profile.role !== "CUSTOMER") throw new AppError(403, "Staff accounts must be managed by the business administrator");
    const partyIds = await tx.cateringRequest.findMany({ where: { userId: user.id }, select: { number: true } });
    await tx.order.updateMany({ where: { userId: user.id }, data: { phone: "", address: "", note: "", cartHash: "redacted" } });
    await tx.message.deleteMany({ where: { order: { userId: user.id } } });
    await tx.audit.updateMany({ where: { OR: [
      { actorId: user.id }, { order: { userId: user.id } },
      ...partyIds.map(({ number }) => ({ detail: { startsWith: `${number}:` } })),
    ] }, data: { detail: "Personal details removed after account deletion." } });
    await tx.cateringRequest.updateMany({ where: { userId: user.id }, data: {
      contactName: "Deleted customer", phone: "", address: "", menuNotes: "", occasion: "", managerNote: "", requestHash: "redacted",
    } });
    await tx.loyaltyEntry.deleteMany({ where: { userId: user.id } });
    await tx.savedAddress.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passwordReset.deleteMany({ where: { userId: user.id } });
    if (profile.phone) await tx.phoneOtp.deleteMany({ where: { phone: profile.phone } });
    await tx.phoneOtp.deleteMany({ where: { userId: user.id } });
    await tx.emailOtp.deleteMany({ where: { OR: [{ email: profile.email }, { userId: user.id }] } });
    await tx.user.update({ where: { id: user.id }, data: {
      name: "Deleted customer", email: `deleted-${randomBytes(18).toString("hex")}@account.invalid`,
      phone: null, phoneVerifiedAt: null, emailVerifiedAt: null, passwordHash: "disabled", marketingOptIn: false, consentAt: null, deletedAt: new Date(),
    } });
    await tx.audit.create({ data: { actorId: user.id, action: "ACCOUNT_ANONYMIZED",
      detail: "Customer requested deletion. Contact data removed; financial totals and status records retained.",
    } });
    return { deleted: true };
  });
}

export async function cleanExpiredOtp() {
  await db.phoneOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.emailOtp.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.passwordReset.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
