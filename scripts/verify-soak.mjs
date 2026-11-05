import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, existsSync, writeFileSync, appendFileSync } from "node:fs";

// Use the same project-owned PostgreSQL guard as verify-core. The application's
// working database is never seeded, loaded or reset by this runner.
const source = new URL(process.env.DATABASE_URL || "");
if (!["127.0.0.1", "localhost"].includes(source.hostname) || source.port !== "55432") {
  throw new Error("Soak verification requires the project-local PostgreSQL on port 55432.");
}
if (!existsSync(".next/BUILD_ID")) throw new Error("Build the application with npm run build before the soak verification.");
const duration = Number(process.env.PERF_DURATION_SECONDS || "300");
if (!Number.isInteger(duration) || duration < 10 || duration > 86400) throw new Error("PERF_DURATION_SECONDS must be an integer between 10 and 86400.");
const origin = "http://127.0.0.1:3001";
// Refuse to share the E2E port with an unrelated server.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error("Port 3001 is occupied. Finish browser/performance verification before test:soak.")));
  probe.listen(3001, "127.0.0.1", () => probe.close(resolve));
});
const name = `deccan_test_${randomBytes(6).toString("hex")}`;
const adminUrl = new URL(source); adminUrl.pathname = "/postgres";
const target = new URL(source); target.pathname = `/${name}`;
const control = new PrismaClient({ adapter: new PrismaPg({ connectionString: adminUrl.toString() }) });
const abort = new AbortController(), children = new Set();
const env = {
  ...process.env, DATABASE_URL: target.toString(), CORE_TEST_DATABASE: name,
  CORE_INTEGRATION: "true", DEMO_MODE: "true", APP_ORIGIN: origin,
  PERF_BASE_URL: origin, PERF_ENVIRONMENT: "local", PERF_ACKNOWLEDGE_WRITES: "synthetic-orders-only",
  PERF_DURATION_SECONDS: String(duration),
};
const reportPath = ".local/soak-verification.json", logPath = ".local/soak-verification.log";
const report = { startedAt: new Date().toISOString(), finishedAt: null, passed: false, durationSeconds: duration, isolatedDatabase: name, steps: [], cleanup: {} };
mkdirSync(".local", { recursive: true }); writeFileSync(logPath, "");
let databaseCreated = false, server;
function stop() { abort.abort(); for (const child of children) child.kill("SIGTERM"); }
process.once("SIGINT", stop); process.once("SIGTERM", stop);
function launch(args, label) {
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  children.add(child);
  child.stdout.on("data", (data) => { process.stdout.write(data); appendFileSync(logPath, data); });
  child.stderr.on("data", (data) => { process.stderr.write(data); appendFileSync(logPath, data); });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    });
  });
  // Retain the promise immediately; server startup failure is observed by ready().
  done.catch(() => {});
  return { child, done, label };
}
async function run(label, args) {
  if (abort.signal.aborted) throw new Error("Soak verification interrupted");
  console.log(`\n→ ${label}`);
  const task = launch(args, label), result = await task.done;
  report.steps.push({ label, passed: result.code === 0 });
  if (result.code !== 0) throw new Error(`${label} failed (${result.code ?? result.signal})`);
}
async function ready(task) {
  const limit = Date.now() + 60000;
  while (Date.now() < limit && !abort.signal.aborted) {
    if (task.child.exitCode !== null || task.child.signalCode !== null) throw new Error("Production server exited before becoming ready");
    try {
      const response = await fetch(`${origin}/api/menu?outlet=kondapur`, { signal: AbortSignal.timeout(1000) });
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {}
    await delay(250);
  }
  throw new Error("Production server readiness timed out or was interrupted");
}
async function shutdown(task) {
  if (!task) return;
  if (task.child.exitCode === null && task.child.signalCode === null) task.child.kill("SIGTERM");
  const exited = await Promise.race([task.done.then(() => true).catch(() => true), delay(5000).then(() => false)]);
  if (!exited) { task.child.kill("SIGKILL"); await task.done.catch(() => {}); }
}
try {
  await control.$executeRawUnsafe(`CREATE DATABASE "${name}"`); databaseCreated = true;
  await run("Migrate isolated soak database", ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  await run("Seed isolated soak database", ["--import", "tsx", "prisma/seed.ts"]);
  server = launch(["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], "Production server");
  await ready(server);
  report.steps.push({ label: "Production server ready on isolated database", passed: true });
  await run(`${duration}-second sustained local load`, ["scripts/sustained-load.mjs"]);
  report.passed = true;
} catch (error) {
  report.error = error.message;
  console.error(error.message); process.exitCode = 1;
} finally {
  stop();
  await shutdown(server);
  report.cleanup.serverStopped = !server || server.child.exitCode !== null || server.child.signalCode !== null;
  if (databaseCreated) {
    try { await control.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); report.cleanup.databaseRemoved = true; }
    catch { report.cleanup.databaseRemoved = false; console.error(`Could not remove isolated soak database ${name}.`); report.passed = false; process.exitCode = 1; }
  }
  await control.$disconnect();
  report.finishedAt = new Date().toISOString();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Soak verification ${report.passed ? "passed" : "failed"}; evidence ${reportPath} and .local/sustained-load-*.json`);
  process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
}
