import { z } from "zod";
import { DELIVERY_LOCALITIES } from "./delivery";
import { phoneIdentifierSchema } from "./validation";

export const customerProfileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(70),
  phone: z.union([z.literal(""), phoneIdentifierSchema]).nullable().transform(value => value || null),
}).strict();

export const savedAddressSchema = z.object({
  label: z.enum(["Home", "Work", "Other"]),
  recipientName: z.string().trim().min(2, "Enter the recipient’s name").max(70),
  phone: phoneIdentifierSchema,
  addressLine: z.string().trim().min(5, "Enter your house, flat or building details").max(120),
  area: z.string().trim().min(2, "Select a delivery area").max(130),
  city: z.string().trim().min(2, "Enter the city").max(50),
  pincode: z.union([z.literal(""), z.string().regex(/^\d{6}$/, "Enter a six-digit pincode")]).default(""),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  localityId: z.string().refine(value => DELIVERY_LOCALITIES.some(locality => locality.id === value),
    "Choose a supported locality").nullable().optional().default(null),
  locationKind: z.enum(["place", "area"]).default("place"),
  isDefault: z.boolean().default(false),
}).strict().superRefine((value, context) => {
  if ([value.addressLine, value.area, value.city, value.pincode].filter(Boolean).join(", ").length > 300)
    context.addIssue({ code: "custom", path: ["addressLine"], message: "Keep the complete delivery address within 300 characters" });
}).transform(value => {
  const locality = DELIVERY_LOCALITIES.find(item => item.id === value.localityId);
  return locality ? { ...value, latitude: locality.latitude, longitude: locality.longitude, locationKind: "area" as const } : value;
});

export const savedAddressPatchSchema = z.union([
  savedAddressSchema,
  z.object({ isDefault: z.literal(true) }).strict(),
]);

export const addressIdSchema = z.string().min(1).max(80);
export type SavedAddressInput = z.input<typeof savedAddressSchema>;
export type SavedAddressPatch = z.input<typeof savedAddressPatchSchema>;
