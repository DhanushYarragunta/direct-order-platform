import { loadBusinessBundle, assertTestBootstrapEnvironment, bootstrapBusiness } from "./business-bootstrap";

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !["--validate", "--dry-run", "--apply"].includes(arg)) || args.length > 1)
    throw new Error("Use no argument (dry-run), --dry-run, --validate, or --apply");
  const { bundle, sha256 } = loadBusinessBundle();
  const counts = { outlets: bundle.outlets.length, menuItems: bundle.menuItems.length, addOns: bundle.addOns.length, availability: bundle.availability.length, cityPrices: bundle.cityPrices.length };
  if (args[0] === "--validate") { console.log(JSON.stringify({ mode: "validate-only", sha256, counts, licences: "blank-unverified" }, null, 2)); return; }
  const apply = args[0] === "--apply";
  assertTestBootstrapEnvironment(process.env, sha256, apply);
  const { db } = await import("../src/lib/db");
  try { console.log(JSON.stringify({ sha256, ...await bootstrapBusiness(db, bundle, apply) }, null, 2)); }
  finally { await db.$disconnect(); }
}
main().catch(error => {
  // Prisma/provider errors may contain connection data; report only our fixed
  // bootstrap messages or a generic failure for unexpected errors.
  console.error(error instanceof Error && /^(Use no argument|Business bootstrap|Apply requires|A bundled menu photo)/.test(error.message)
    ? error.message : "Business bootstrap failed validation or database checks; no partial import was committed.");
  process.exitCode = 1;
});
