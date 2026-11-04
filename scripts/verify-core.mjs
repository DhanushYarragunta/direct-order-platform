import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";

const performanceOnly = process.argv.includes("--performance");
const logPath = performanceOnly ? ".local/performance.log" : ".local/verification.log";
const reportPath = performanceOnly ? ".local/performance-verification.json" : ".local/core-verification.json";

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
writeFileSync(logPath, "");
if (performanceOnly) {
  rmSync(".local/performance-throughput.json", { force: true });
  rmSync(".local/performance-checkout.json", { force: true });
}
function run(label, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n→ ${label}`);
    const child = spawn(process.execPath, args, {
      env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      appendFileSync(logPath, data);
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      appendFileSync(logPath, data);
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
  if (!performanceOnly && !process.argv.includes("--e2e"))
    await run("Database integration tests", [
      "node_modules/vitest/vitest.mjs",
      "run",
    ]);
  if (performanceOnly)
    await run("Local synthetic throughput and automated mobile checkout timing", [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.performance.config.ts",
    ]);
  else if (!process.argv.includes("--integration"))
    await run("Browser tests and responsive screenshots", [
      "node_modules/@playwright/test/cli.js",
      "test",
    ]);
  report.passed = true;
  console.log(performanceOnly
    ? "\nLocal performance checks passed. Evidence: .local/performance-*.json"
    : "\nCore verification passed. Screenshots: .local/screenshots/");
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
    reportPath,
    JSON.stringify(report, null, 2),
  );
}
