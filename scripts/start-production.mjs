import { spawn } from "node:child_process";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
let origin;
try { origin = new URL(process.env.APP_ORIGIN || ""); }
catch { throw new Error("APP_ORIGIN must be an absolute URL"); }
if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password)
  throw new Error("APP_ORIGIN must contain only a scheme, hostname and optional port");
const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname);
if (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback))
  throw new Error("Public deployments require an HTTPS APP_ORIGIN");
if (!loopback && process.env.DEMO_MODE === "true" && process.env.ALLOW_PUBLIC_DEMO !== "true")
  throw new Error("Set ALLOW_PUBLIC_DEMO=true to explicitly publish a demo with shared accounts and simulated phone codes");
if (!loopback && process.env.DEMO_MODE !== "true" && !process.env.PRIVACY_CONTACT?.trim())
  throw new Error("Set the business PRIVACY_CONTACT before accepting public customer data");

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", process.env.PORT || "3000"], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
