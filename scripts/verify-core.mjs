import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";

// Every integration/browser run gets a new database; never reset the working demo.
const source = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost"].includes(source.hostname) ||
  source.port !== "55432"
)
  throw new Error(
    "Core verification uses the project-local PostgreSQL on port 55432 only.",
  );
const name = `deccan_test_${randomBytes(6).toString("hex")}`;
const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
const control = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.toString() }),
});
const target = new URL(source);
target.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: target.toString(),
  CORE_TEST_DATABASE: name,
  CORE_INTEGRATION: "true",
  DEMO_MODE: "true",
  APP_ORIGIN: "http://127.0.0.1:3001",
};
const report = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  passed: false,
  steps: [],
};
mkdirSync(".local", { recursive: true });
writeFileSync(".local/verification.log", "");
function run(label, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n→ ${label}`);
    const child = spawn(process.execPath, args, {
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      appendFileSync(".local/verification.log", data);
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      appendFileSync(".local/verification.log", data);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      report.steps.push({ label, passed: code === 0 });
      code === 0 ? resolve() : reject(new Error(`${label} failed (${code})`));
    });
  });
}
try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await run("Migrate isolated test database", [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
  ]);
  await run("Seed isolated test database", [
    "--import",
    "tsx",
    "prisma/seed.ts",
  ]);
  if (!process.argv.includes("--e2e"))
    await run("Database integration tests", [
      "node_modules/vitest/vitest.mjs",
      "run",
    ]);
  if (!process.argv.includes("--integration"))
    await run("Browser tests and responsive screenshots", [
      "node_modules/@playwright/test/cli.js",
      "test",
    ]);
  report.passed = true;
  console.log("\nCore verification passed. Screenshots: .local/screenshots/");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await control
    .$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
    .catch(() =>
      console.error(`Could not remove isolated test database ${name}.`),
    );
  await control.$disconnect();
  report.finishedAt = new Date().toISOString();
  writeFileSync(
    ".local/core-verification.json",
    JSON.stringify(report, null, 2),
  );
}
