import { AppError, type AuthUser } from "./auth";
import { db, serializable } from "./db";
import { couponSchema, couponUpdateSchema, type CouponInput } from "./coupon-validation";

export async function listCoupons(user: AuthUser) {
  if (user.role !== "ADMIN") throw new AppError(403, "Only central administrators can manage coupons");
  return { coupons: await db.coupon.findMany({ orderBy: { code: "asc" } }) };
}
export async function saveCoupon(user: AuthUser, input: CouponInput, version?: number) {
  if (user.role !== "ADMIN") throw new AppError(403, "Only central administrators can manage coupons");
  const parsed = version === undefined ? couponSchema.parse(input) : couponUpdateSchema.parse({ ...input, version });
  const { code, description, type, value, minSubtotalPaise, maxDiscountPaise, firstOrderOnly, active } = parsed;
  const data = { description, type, value, minSubtotalPaise, maxDiscountPaise, firstOrderOnly, active,
    startsAt: new Date(parsed.startsAt), expiresAt: new Date(parsed.expiresAt) };
  return serializable(async tx => {
    const actor = await tx.user.findFirst({ where: { id: user.id, role: "ADMIN", deletedAt: null } });
    if (!actor) throw new AppError(403, "Only central administrators can manage coupons");
    if (version === undefined) {
      if (await tx.coupon.findUnique({ where: { code } })) throw new AppError(409, "This coupon code already exists");
      if (await tx.coupon.count() >= 500) throw new AppError(409, "The coupon limit has been reached. Reuse an existing coupon.");
      await tx.coupon.create({ data: { code, ...data } });
    } else {
      const updated = await tx.coupon.updateMany({ where: { code, version }, data: { ...data, version: { increment: 1 } } });
      if (!updated.count) throw new AppError(409, "This coupon changed in another session. Refresh and reopen it before saving.");
    }
    await tx.audit.create({ data: { actorId: user.id, action: version === undefined ? "COUPON_CREATED" : "COUPON_UPDATED",
      detail: `${code}: ${active ? "enabled" : "paused"}; ${type} discount. Existing checkouts keep their saved terms.` } });
    return tx.coupon.findUniqueOrThrow({ where: { code } });
  });
}
