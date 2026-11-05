import { runOrderJobs } from "../src/lib/orders";
import { cleanExpiredOtp } from "../src/lib/privacy";
import { writeFile } from "node:fs/promises";
let running = false;
let lastMaintenance = 0;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runOrderJobs();
    if (Date.now() - lastMaintenance >= 60_000) {
      await cleanExpiredOtp();
      lastMaintenance = Date.now();
    }
    if (process.env.WORKER_HEARTBEAT_FILE)
      await writeFile(process.env.WORKER_HEARTBEAT_FILE, String(Date.now()), { mode: 0o600 });
  } catch (error) {
    console.error(
      "Worker failed:",
      error instanceof Error ? error.name : "unknown",
    );
  } finally {
    running = false;
  }
}, 3000);
console.log("Order worker started.");
