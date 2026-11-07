import { z } from "zod";
import { CATEGORIES, MAX_QUANTITY } from "./domain";
import { isMenuPhoto } from "./photo-policy";
import { normalizeCity } from "./menu-context";
import { DELIVERY_LOCALITIES } from "./delivery";

const localityId = z.string().refine((value) => DELIVERY_LOCALITIES.some((item) => item.id === value), "Choose a supported locality").optional();

export const cartLineSchema = z
  .object({
    itemId: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(MAX_QUANTITY),
    portion: z.enum(["regular", "family"]),
    addOnIds: z
      .array(z.string().max(80))
      .max(4)
      .refine((a) => new Set(a).size === a.length, "Duplicate add-ons"),
  })
  .strict();
export const checkoutSchema = z
  .object({
    checkoutKey: z.string().uuid(),
    outletId: z.string().min(1).max(80),
    lines: z.array(cartLineSchema).min(1).max(30),
    fulfillment: z.enum(["pickup", "delivery"]),
    address: z.string().trim().max(300).default(""),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
    note: z.string().trim().max(250).default(""),
    couponCode: z.string().trim().max(30).transform((v) => v.toUpperCase()).optional(),
    redeemedPoints: z.number().int().min(0).max(100000).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    localityId,
    localityConfirmed: z.boolean().optional(),
    checkoutStartedAt: z.iso.datetime().optional(),
    expectedTotalPaise: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.fulfillment === "delivery" &&
      (v.address.length < 8 ||
        (!v.localityId && (v.latitude === undefined || v.longitude === undefined)) ||
        (!!v.localityId && !v.localityConfirmed))
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a delivery location and enter a complete address",
        path: ["address"],
      });
  });
export const quoteSchema = z.object({
  outletId: z.string().min(1).max(80),
  lines: z.array(cartLineSchema).min(1).max(30),
  couponCode: z.string().trim().max(30).transform((v) => v.toUpperCase()).optional(),
  useLoyalty: z.boolean().optional(),
  fulfillment: z.enum(["pickup", "delivery"]).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  localityId,
}).strict();
const emailAddress = z.string().trim().toLowerCase().email().max(150);
export const phoneIdentifierSchema = z.string().trim().max(30).transform((value) => {
  let phone = value.replace(/[\s().-]/g, "");
  if (phone.startsWith("+91")) phone = phone.slice(3);
  else if (phone.length === 12 && phone.startsWith("91")) phone = phone.slice(2);
  return phone;
}).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid Indian mobile number"));
export const optionalPhoneSchema = z.union([z.literal(""), phoneIdentifierSchema]).optional().transform(value => value || undefined);
export const loginIdentifierSchema = z.string().trim().max(150).transform((value, context) => {
  const result = value.includes("@") ? emailAddress.safeParse(value) : phoneIdentifierSchema.safeParse(value);
  if (!result.success) {
    context.addIssue({ code: "custom", message: "Enter a valid email address or Indian mobile number" });
    return z.NEVER;
  }
  return result.data;
});
export const loginSchema = z.union([
  z.object({ identifier: loginIdentifierSchema, password: z.string().min(1).max(128) }).strict(),
  z.object({ email: emailAddress, password: z.string().min(1).max(128) }).strict()
    .transform(({ email, password }) => ({ identifier: email, password })),
]);
export const registerSchema = z.object({
  email: emailAddress,
  name: z.string().trim().min(2).max(70),
  phone: optionalPhoneSchema,
  password: z.string().min(10).max(128),
  consent: z.literal(true),
  marketingOptIn: z.boolean().default(false),
}).strict();
export const paymentSchema = z
  .object({
    attemptKey: z.string().uuid(),
    method: z.enum(["UPI", "CARD"]),
    outcome: z.enum(["success", "failed", "pending"]),
  })
  .strict();
export const transitionSchema = z
  .object({
    status: z.enum(["PREPARING", "READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const overrideSchema = z
  .object({
    minutes: z.number().int().min(1).max(180),
    reason: z.string().trim().min(5).max(200),
    version: z.number().int().nonnegative(),
  })
  .strict();
export const menuSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().min(5).max(240),
    category: z.enum(CATEGORIES),
    pricePaise: z.number().int().min(100).max(1000000),
    familyPricePaise: z.number().int().min(100).max(1000000).nullable(),
    portion: z.string().trim().min(2).max(60),
    vegetarian: z.boolean(),
    spice: z.enum(["Mild", "Medium", "Hot", "Sweet"]),
    allergens: z.array(z.string().trim().min(1).max(30)).max(12),
    photo: z.string().refine(isMenuPhoto, "Choose a supplied or uploaded menu photo").nullable(),
    prepMinutes: z.number().int().min(1).max(120),
    active: z.boolean(),
    featured: z.boolean(),
    menuDays: z.array(z.number().int().min(0).max(6)).max(7)
      .refine((days) => new Set(days).size === days.length, "Choose each day once").default([]),
    menuStartMinute: z.number().int().min(0).max(1439).nullable().default(null),
    menuEndMinute: z.number().int().min(0).max(1439).nullable().default(null),
    cityPrices: z.array(z.object({
      city: z.string().trim().min(2).max(60).transform(normalizeCity),
      pricePaise: z.number().int().min(100).max(1000000),
      familyPricePaise: z.number().int().min(100).max(1000000).nullable(),
    }).strict()).max(30)
      .refine((prices) => new Set(prices.map((price) => price.city)).size === prices.length, "Add each city only once")
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const hasStart = value.menuStartMinute !== null;
    const hasEnd = value.menuEndMinute !== null;
    if (hasStart !== hasEnd || (hasStart && !value.menuDays.length) || (!hasStart && value.menuDays.length))
      context.addIssue({ code: "custom", path: ["menuDays"], message: "Choose start days and both times, or leave the schedule off" });
    if (hasStart && value.menuStartMinute === value.menuEndMinute)
      context.addIssue({ code: "custom", path: ["menuEndMinute"], message: "Opening and closing times must be different" });
  });
