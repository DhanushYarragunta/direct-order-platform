import { spawn } from "node:child_process";
import { validateStartupConfig } from "./startup-config.mjs";

const config = validateStartupConfig();
if (config.publicTestPayments)
  console.log("Public staging enabled: Razorpay test payments do not collect real money. Configured email services can send real messages.");

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", process.env.PORT || "3000"], { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
