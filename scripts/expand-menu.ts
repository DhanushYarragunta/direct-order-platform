import { loadMenuCatalog, assertMenuExpansionEnvironment, expandMenu } from "./menu-expansion";

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--validate", "--dry-run", "--apply"].includes(arg)))
    throw new Error("Menu expansion accepts --validate, --dry-run (default), or --apply");
  const { catalog, sha256 } = loadMenuCatalog();
  if (args[0] === "--validate") {
    console.log(JSON.stringify({ mode: "validate-only", sha256, totalDishes: catalog.items.length,
      newDishes: 53, newAvailability: 159, categories: [...new Set(catalog.items.map(item => item.category))] }, null, 2));
    return;
  }
  const apply = args[0] === "--apply";
  assertMenuExpansionEnvironment(process.env, sha256, apply);
  const { db } = await import("../src/lib/db");
  try { console.log(JSON.stringify({ sha256, ...await expandMenu(db, catalog, apply) }, null, 2)); }
  finally { await db.$disconnect(); }
}
main().catch(error => {
  console.error(error instanceof Error && /^(Menu expansion|Business bootstrap is restricted)/.test(error.message)
    ? error.message : "Menu expansion failed validation or database checks; no partial import was committed.");
  process.exitCode = 1;
});
