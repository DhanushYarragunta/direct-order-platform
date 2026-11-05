import { z } from "zod";

export const outletPolicySchema = z.object({
  outletId: z.string().min(1).max(80),
  expectedUpdatedAt: z.iso.datetime(),
  fssai: z.string().regex(/^\d{14}$/, "Enter exactly 14 FSSAI digits"),
  fssaiVerified: z.boolean(),
  verificationNote: z.string().trim().max(300).default(""),
  deliveryFeePaise: z.number().int().min(0).max(100000),
  minDeliveryPaise: z.number().int().min(0).max(1000000),
  freeDeliveryAbovePaise: z.number().int().min(0).max(1000000),
  minPrepMinutes: z.number().int().min(5).max(180),
  activeStations: z.number().int().min(1).max(100),
  radiusKm: z.number().min(0.1).max(50),
  open: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.fssaiVerified && /^0/.test(value.fssai))
    context.addIssue({ code: "custom", path: ["fssai"], message: "A zero-prefixed demo number cannot be marked verified" });
  if (value.fssaiVerified && value.verificationNote.length < 10)
    context.addIssue({ code: "custom", path: ["verificationNote"], message: "Record how and when you checked the outlet licence" });
  if (value.freeDeliveryAbovePaise < value.minDeliveryPaise)
    context.addIssue({ code: "custom", path: ["freeDeliveryAbovePaise"], message: "Free-delivery threshold must be at least the delivery minimum" });
});
