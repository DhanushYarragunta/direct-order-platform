import { z } from "zod";

export const couponCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,29}$/, "Use 3–30 letters, numbers, underscores or hyphens for the code");
export const couponFieldsSchema = z.object({
  code: couponCodeSchema,
  description: z.string().trim().min(5).max(180),
  type: z.enum(["FIXED", "PERCENT"]),
  value: z.number().int().positive().max(1000000),
  minSubtotalPaise: z.number().int().min(0).max(10000000),
  maxDiscountPaise: z.number().int().min(100).max(1000000),
  firstOrderOnly: z.boolean(),
  active: z.boolean(),
  startsAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();
function validTerms(value: z.infer<typeof couponFieldsSchema>, context: z.RefinementCtx) {
  if (value.type === "PERCENT" && value.value > 100)
    context.addIssue({ code: "custom", path: ["value"], message: "Percentage discounts must be between 1 and 100" });
  if (value.type === "FIXED" && value.value < 100)
    context.addIssue({ code: "custom", path: ["value"], message: "Fixed discounts start at ₹1" });
  if (new Date(value.expiresAt) <= new Date(value.startsAt))
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after the start date" });
}
export const couponSchema = couponFieldsSchema.superRefine(validTerms);
export const couponUpdateSchema = couponFieldsSchema.extend({ version: z.number().int().nonnegative() }).superRefine(validTerms);
export type CouponInput = z.infer<typeof couponSchema>;
export type CouponRecord = CouponInput & { version: number };
export function couponStatus(coupon: Pick<CouponInput, "active" | "startsAt" | "expiresAt">, now = Date.now()) {
  if (!coupon.active) return "Paused";
  if (new Date(coupon.expiresAt).getTime() <= now) return "Expired";
  if (new Date(coupon.startsAt).getTime() > now) return "Scheduled";
  return "Active";
}
