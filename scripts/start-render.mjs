import { spawnSync } from "node:child_process";
import { validateStartupConfig } from "./startup-config.mjs";

// Render's Docker command is an argument list, not a shell expression. Keep the
// approved migrate-then-start sequence here so quoting cannot skip migration.
validateStartupConfig();
const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
  stdio: "inherit",
});
if (migration.error || migration.status !== 0) {
  console.error("Database migration failed; the new application will not start.");
  process.exit(migration.status || 1);
}
await import("./start-production.mjs");
