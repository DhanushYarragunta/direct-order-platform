import { z } from "zod";
import { CATEGORIES, MAX_QUANTITY, PHOTOS } from "./domain";

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
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.fulfillment === "delivery" &&
      (v.address.length < 8 ||
        v.latitude === undefined ||
        v.longitude === undefined)
    )
      c.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a delivery location and enter a complete address",
        path: ["address"],
      });
  });
export const loginSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(150)
      .transform((v) => v.toLowerCase().trim()),
    password: z.string().min(1).max(128),
  })
  .strict();
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(70),
  password: z.string().min(10).max(128),
  consent: z.literal(true),
  marketingOptIn: z.boolean().default(false),
});
export const paymentSchema = z
  .object({
    attemptKey: z.string().uuid(),
    method: z.enum(["UPI", "CARD"]),
    outcome: z.enum(["success", "failed", "pending"]),
  })
  .strict();
export const transitionSchema = z
  .object({
    status: z.enum(["PREPARING", "READY", "HANDED_OFF", "CANCELLED"]),
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
    photo: z.enum(PHOTOS).nullable(),
    prepMinutes: z.number().int().min(1).max(120),
    active: z.boolean(),
    featured: z.boolean(),
  })
  .strict();
