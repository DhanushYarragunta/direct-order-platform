import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { CATEGORIES, PHOTOS } from "../src/lib/domain";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const text = z.string().trim().min(1).max(1000);
const amount = z.number().int().min(0).max(10_000_000);
const minute = z.number().int().min(0).max(1439).nullable();
const strings = z.array(z.string().min(1).max(80)).max(30);
const outletSchema = z.object({
  id, name: text, address: text, city: text, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  radiusKm: z.number().min(0.1).max(50), minPrepMinutes: z.number().int().min(5).max(180), activeStations: z.number().int().min(1).max(100),
  fssai: z.literal(""), fssaiVerified: z.literal(false), deliveryFeePaise: amount, minDeliveryPaise: amount, freeDeliveryAbovePaise: amount, open: z.boolean(),
}).strict().refine(row => row.freeDeliveryAbovePaise >= row.minDeliveryPaise, "Invalid delivery thresholds");
const menuSchema = z.object({
  id, name: text, description: text, category: z.enum(CATEGORIES), pricePaise: amount, familyPricePaise: amount.nullable(),
  portion: text, vegetarian: z.boolean(), spice: text, allergens: strings,
  photo: z.string().refine(value => (PHOTOS as readonly string[]).includes(value), "Only bundled menu photos are allowed"),
  prepMinutes: z.number().int().min(1).max(180), active: z.boolean(), featured: z.boolean(),
  menuDays: z.array(z.number().int().min(0).max(6)).max(7), menuStartMinute: minute, menuEndMinute: minute,
}).strict().refine(row => (row.menuStartMinute === null) === (row.menuEndMinute === null), "Serving hours must have both endpoints");
export const businessBundleSchema = z.object({
  schemaVersion: z.literal(1), purpose: z.literal("test-catalog"), licencePolicy: z.literal("blank-unverified"),
  outlets: z.array(outletSchema).min(1).max(50), menuItems: z.array(menuSchema).min(1).max(500),
  addOns: z.array(z.object({ id, name: text, pricePaise: amount, prepMinutes: z.number().int().min(0).max(180), allergens: strings, active: z.boolean() }).strict()).max(100),
  availability: z.array(z.object({ outletId: id, itemId: id, available: z.boolean() }).strict()).max(25000),
  cityPrices: z.array(z.object({ itemId: id, city: text, pricePaise: amount, familyPricePaise: amount.nullable() }).strict()).max(10000),
}).strict().superRefine((bundle, context) => {
  const distinct = (rows: object[], key: (row: any) => string, name: string) => {
    if (new Set(rows.map(key)).size !== rows.length) context.addIssue({ code: "custom", message: `Duplicate ${name} identity` });
  };
  distinct(bundle.outlets, row => row.id, "outlet"); distinct(bundle.menuItems, row => row.id, "menu item"); distinct(bundle.addOns, row => row.id, "add-on");
  distinct(bundle.availability, row => `${row.outletId}/${row.itemId}`, "availability");
  distinct(bundle.cityPrices, row => JSON.stringify([row.itemId, row.city]), "city price");
  const outlets = new Set(bundle.outlets.map(row => row.id)), items = new Set(bundle.menuItems.map(row => row.id));
  if (bundle.availability.some(row => !outlets.has(row.outletId) || !items.has(row.itemId)) || bundle.cityPrices.some(row => !items.has(row.itemId)))
    context.addIssue({ code: "custom", message: "Catalog relationship points outside this bundle" });
});
export type BusinessBundle = z.infer<typeof businessBundleSchema>;
export const businessBundlePath = resolve("prisma/bootstrap/business-test.json");
export function loadBusinessBundle() {
  const bytes = readFileSync(businessBundlePath);
  const bundle = businessBundleSchema.parse(JSON.parse(bytes.toString("utf8")));
  for (const row of bundle.menuItems)
    if (!existsSync(resolve("public", row.photo.slice(1)))) throw new Error("A bundled menu photo is missing from this release");
  return { bundle, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function assertTestBootstrapEnvironment(env: Record<string, string | undefined>, sha256: string, apply: boolean) {
  if (env.DEMO_MODE !== "false" || env.PAYMENT_PROVIDER !== "razorpay" || !/^rzp_test_[A-Za-z0-9_]+$/.test(env.RAZORPAY_KEY_ID || "") || env.ALLOW_PUBLIC_TEST_PAYMENTS !== "true")
    throw new Error("Business bootstrap is restricted to explicitly enabled Razorpay test staging with DEMO_MODE=false");
  if (apply && (env.BOOTSTRAP_TEST_BUSINESS_DATA !== "true" || env.BUSINESS_BOOTSTRAP_SHA256 !== sha256))
    throw new Error("Apply requires BOOTSTRAP_TEST_BUSINESS_DATA=true and the approved BUSINESS_BOOTSTRAP_SHA256");
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
};
function missingRows<T extends object>(name: string, desired: T[], existing: object[], key: (row: any) => string): T[] {
  const current = new Map(existing.map(row => [key(row), row as Record<string, unknown>]));
  return desired.filter(row => {
    const found = current.get(key(row));
    if (!found) return true;
    const allowed = Object.fromEntries(Object.keys(row).map(field => [field, found[field]]));
    if (canonical(row) !== canonical(allowed)) throw new Error(`Business bootstrap conflict in ${name}; existing data was preserved`);
    return false;
  });
}
export async function bootstrapBusiness(db: PrismaClient, input: BusinessBundle, apply = false) {
  const bundle = businessBundleSchema.parse(input);
  return db.$transaction(async tx => {
    // Serialize repeated bootstrap processes; ordinary application data is never updated.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('business-test-catalog-bootstrap-v1'))`;
    const [outlets, menuItems, addOns, availability, cityPrices] = await Promise.all([
      tx.outlet.findMany({ where: { id: { in: bundle.outlets.map(row => row.id) } } }),
      tx.menuItem.findMany({ where: { id: { in: bundle.menuItems.map(row => row.id) } } }),
      tx.addOn.findMany({ where: { id: { in: bundle.addOns.map(row => row.id) } } }),
      tx.availability.findMany({ where: { outletId: { in: bundle.outlets.map(row => row.id) }, itemId: { in: bundle.menuItems.map(row => row.id) } } }),
      tx.menuCityPrice.findMany({ where: { itemId: { in: bundle.menuItems.map(row => row.id) } } }),
    ]);
    const insert = {
      outlets: missingRows("outlets", bundle.outlets, outlets, row => row.id),
      menuItems: missingRows("menu items", bundle.menuItems, menuItems, row => row.id),
      addOns: missingRows("add-ons", bundle.addOns, addOns, row => row.id),
      availability: missingRows("availability", bundle.availability, availability, row => `${row.outletId}/${row.itemId}`),
      cityPrices: missingRows("city prices", bundle.cityPrices, cityPrices, row => JSON.stringify([row.itemId, row.city])),
    };
    // Every comparison above finishes before the first insert. Any later constraint
    // failure rolls back the entire transaction; no upsert/update/delete is used.
    if (apply) {
      if (insert.outlets.length) await tx.outlet.createMany({ data: insert.outlets });
      if (insert.menuItems.length) await tx.menuItem.createMany({ data: insert.menuItems });
      if (insert.addOns.length) await tx.addOn.createMany({ data: insert.addOns });
      if (insert.availability.length) await tx.availability.createMany({ data: insert.availability });
      if (insert.cityPrices.length) await tx.menuCityPrice.createMany({ data: insert.cityPrices });
    }
    return { mode: apply ? "applied" : "dry-run", insert: Object.fromEntries(Object.entries(insert).map(([name, rows]) => [name, rows.length])),
      unchanged: Object.fromEntries(Object.entries(insert).map(([name, rows]) => [name, bundle[name as keyof typeof insert].length - rows.length])) };
  }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
}
