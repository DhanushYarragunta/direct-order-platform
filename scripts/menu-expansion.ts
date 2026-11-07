import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { menuSchema } from "../src/lib/validation";
import { assertTestBootstrapEnvironment } from "./business-bootstrap";

export const ORIGINAL_MENU_IDS = ["chicken-biryani", "vegetable-biryani", "mirchi-ka-salan", "double-ka-meetha", "mutton-haleem", "cucumber-raita", "gulab-jamun"] as const;
export const MENU_OUTLET_IDS = ["kondapur", "gachibowli", "kukatpally"] as const;
const identifier = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const { cityPrices: _cityPrices, ...menuFields } = menuSchema.shape;
const itemSchema = z.object({ id: identifier, ...menuFields }).strict().superRefine((row, ctx) => {
  const { id: _id, ...fields } = row;
  const checked = menuSchema.safeParse(fields);
  if (!checked.success) for (const issue of checked.error.issues)
    ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
});
export const menuCatalogSchema = z.object({
  schemaVersion: z.literal(1), purpose: z.literal("hyderabadi-menu-expansion"),
  outletIds: z.array(identifier).length(3), preservedItemIds: z.array(identifier).length(7),
  items: z.array(itemSchema).length(60),
}).strict().superRefine((catalog, ctx) => {
  const sameIds = (actual: string[], expected: readonly string[]) => actual.length === expected.length && new Set(actual).size === expected.length && expected.every(id => actual.includes(id));
  if (!sameIds(catalog.outletIds, MENU_OUTLET_IDS) || !sameIds(catalog.preservedItemIds, ORIGINAL_MENU_IDS))
    ctx.addIssue({ code: "custom", message: "Menu expansion must preserve the original seven dishes and three outlets" });
  if (new Set(catalog.items.map(item => item.id)).size !== 60 || ORIGINAL_MENU_IDS.some(id => !catalog.items.some(item => item.id === id)))
    ctx.addIssue({ code: "custom", message: "Menu expansion requires 60 distinct dishes including the original seven" });
});
export type MenuCatalog = z.infer<typeof menuCatalogSchema>;
export const menuCatalogPath = resolve("prisma/catalog/menu.json");
export function loadMenuCatalog() {
  const bytes = readFileSync(menuCatalogPath);
  const catalog = menuCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
  for (const item of catalog.items)
    if (!item.photo || !existsSync(resolve("public", item.photo.slice(1)))) throw new Error("Menu expansion has a missing bundled dish photo");
  return { catalog, sha256: createHash("sha256").update(bytes).digest("hex") };
}
export function assertMenuExpansionEnvironment(env: Record<string, string | undefined>, sha256: string, apply: boolean) {
  assertTestBootstrapEnvironment(env, sha256, false);
  if (apply && (env.APPLY_MENU_EXPANSION !== "true" || env.MENU_EXPANSION_SHA256 !== sha256))
    throw new Error("Menu expansion apply requires APPLY_MENU_EXPANSION=true and the approved MENU_EXPANSION_SHA256");
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
};

export async function expandMenu(db: PrismaClient, input: MenuCatalog, apply = false) {
  const catalog = menuCatalogSchema.parse(input);
  const additions = catalog.items.filter(item => !catalog.preservedItemIds.includes(item.id));
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hyderabadi-menu-expansion-v1'))`;
    const [outlets, existing, availability] = await Promise.all([
      tx.outlet.findMany({ where: { id: { in: catalog.outletIds } }, select: { id: true } }),
      tx.menuItem.findMany(),
      tx.availability.findMany({ where: { outletId: { in: catalog.outletIds }, itemId: { in: additions.map(item => item.id) } } }),
    ]);
    if (outlets.length !== 3 || catalog.preservedItemIds.some(id => !existing.some(item => item.id === id)))
      throw new Error("Menu expansion requires the existing three outlets and original seven dishes; no rows were changed");
    if (existing.some(item => !catalog.items.some(desired => desired.id === item.id)))
      throw new Error("Menu expansion found additional existing dishes; review the target catalog before importing");
    const missing = additions.filter(item => {
      const current = existing.find(row => row.id === item.id);
      if (!current) return true;
      const comparable = Object.fromEntries(Object.keys(item).map(field => [field, current[field as keyof typeof current]]));
      if (canonical(item) !== canonical(comparable)) throw new Error("Menu expansion conflicts with an existing dish; all administrator edits were preserved");
      return false;
    });
    const addedAvailability = additions.flatMap(item => catalog.outletIds.map(outletId => ({ outletId, itemId: item.id, available: true })))
      .filter(row => !availability.some(current => current.outletId === row.outletId && current.itemId === row.itemId));
    // Existing availability can be false because a manager paused a dish. Never
    // change it on a repeated import, and never touch the original seven rows.
    if (apply) {
      if (missing.length) await tx.menuItem.createMany({ data: missing });
      if (addedAvailability.length) await tx.availability.createMany({ data: addedAvailability });
    }
    return { mode: apply ? "applied" : "dry-run", insert: { menuItems: missing.length, availability: addedAvailability.length },
      preserved: { originalMenuItems: 7, outlets: 3 }, unchangedAddedItems: additions.length - missing.length };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}
