import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AppError } from "./auth";
import { db, serializable } from "./db";
import {
  addressIdSchema, customerProfileSchema, savedAddressSchema, savedAddressPatchSchema,
  type SavedAddressInput, type SavedAddressPatch,
} from "./profile-validation";

export const savedAddressSelect = {
  id: true, label: true, recipientName: true, phone: true, addressLine: true,
  area: true, city: true, pincode: true, latitude: true, longitude: true,
  localityId: true, locationKind: true, isDefault: true, createdAt: true, updatedAt: true,
} satisfies Prisma.SavedAddressSelect;

const profileSelect = {
  id: true, name: true, email: true, phone: true, emailVerifiedAt: true,
  phoneVerifiedAt: true, createdAt: true, role: true,
  favorites: { select: { itemId: true }, orderBy: { createdAt: "desc" } },
  addresses: { select: savedAddressSelect, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "asc" }] },
} satisfies Prisma.UserSelect;

async function lockCustomer(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new AppError(401, "This account is no longer available");
  if (user.role !== "CUSTOMER") throw new AppError(403, "Customer profile changes are unavailable for staff accounts");
  return user;
}

export async function customerProfile(userId: string) {
  const profile = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: profileSelect });
  if (!profile) throw new AppError(401, "This account is no longer available");
  return profile;
}

export async function setFavorite(userId: string, itemId: string, saved: boolean) {
  return serializable(async tx => {
    await lockCustomer(tx, userId);
    if (saved) {
      const item = await tx.menuItem.findFirst({ where: { id: itemId, active: true }, select: { id: true } });
      if (!item) throw new AppError(404, "This dish is no longer on the menu");
      const existing = await tx.favorite.findUnique({ where: { userId_itemId: { userId, itemId } } });
      if (!existing && await tx.favorite.count({ where: { userId } }) >= 100)
        throw new AppError(409, "You can save up to 100 favourites");
      await tx.favorite.upsert({ where: { userId_itemId: { userId, itemId } }, create: { userId, itemId }, update: {} });
    } else await tx.favorite.deleteMany({ where: { userId, itemId } });
    return { itemId, saved };
  });
}

export async function updateCustomerProfile(userId: string, input: { name: string; phone: string | null }) {
  const values = customerProfileSchema.parse(input);
  try {
    return await serializable(async tx => {
      const user = await lockCustomer(tx, userId);
      const phoneChanged = user.phone !== values.phone;
      if (phoneChanged && values.phone) {
        const owner = await tx.user.findUnique({ where: { phone: values.phone }, select: { id: true } });
        if (owner && owner.id !== userId) throw new AppError(409, "This mobile number is already linked to another account");
      }
      if (phoneChanged) {
        // A saved contact is not verified ownership. Old contact codes and SMS
        // recovery challenges must not remain usable after changing the number.
        const contacts = [user.phone, values.phone].filter((value): value is string => !!value);
        await tx.phoneOtp.deleteMany({ where: { OR: [{ userId }, { phone: { in: contacts } }] } });
        await tx.passwordReset.deleteMany({ where: { channel: "sms", OR: [
          { userId }, { contactHash: { in: contacts.map(value => createHash("sha256").update(value).digest("hex")) } },
        ] } });
      }
      const profile = await tx.user.update({ where: { id: userId }, data: {
        ...values, ...(phoneChanged ? { phoneVerifiedAt: null } : {}),
      }, select: profileSelect });
      await tx.audit.create({ data: { actorId: userId, action: "PROFILE_UPDATED",
        detail: phoneChanged ? "Customer updated their profile and delivery phone; phone verification cleared." : "Customer updated their profile.",
      } });
      return profile;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new AppError(409, "This mobile number is already linked to another account");
    throw error;
  }
}

export async function customerAddresses(userId: string) {
  const profile = await customerProfile(userId);
  return { addresses: profile.addresses };
}

export async function createSavedAddress(userId: string, input: SavedAddressInput) {
  const values = savedAddressSchema.parse(input);
  return serializable(async tx => {
    await lockCustomer(tx, userId);
    const count = await tx.savedAddress.count({ where: { userId } });
    if (count >= 10) throw new AppError(409, "You can save up to 10 addresses. Remove an old address to add another.");
    const isDefault = values.isDefault || count === 0;
    if (isDefault) await tx.savedAddress.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.savedAddress.create({ data: { ...values, userId, isDefault }, select: savedAddressSelect });
  });
}

export async function updateSavedAddress(userId: string, addressId: string, input: SavedAddressPatch) {
  addressId = addressIdSchema.parse(addressId);
  const values = savedAddressPatchSchema.parse(input);
  return serializable(async tx => {
    await lockCustomer(tx, userId);
    const current = await tx.savedAddress.findFirst({ where: { id: addressId, userId } });
    if (!current) throw new AppError(404, "This saved address could not be found");
    // Editing the default cannot leave an address book with no default. Choose
    // another address as default to switch; deleting it promotes a survivor.
    const isDefault = values.isDefault || current.isDefault;
    if (isDefault) await tx.savedAddress.updateMany({ where: { userId, isDefault: true, id: { not: addressId } }, data: { isDefault: false } });
    return tx.savedAddress.update({ where: { id: addressId }, data: { ...values, isDefault }, select: savedAddressSelect });
  });
}

export async function deleteSavedAddress(userId: string, addressId: string) {
  addressId = addressIdSchema.parse(addressId);
  return serializable(async tx => {
    await lockCustomer(tx, userId);
    const current = await tx.savedAddress.findFirst({ where: { id: addressId, userId } });
    if (!current) throw new AppError(404, "This saved address could not be found");
    await tx.savedAddress.delete({ where: { id: addressId } });
    if (current.isDefault) {
      const next = await tx.savedAddress.findFirst({ where: { userId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (next) await tx.savedAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { deleted: true };
  });
}
