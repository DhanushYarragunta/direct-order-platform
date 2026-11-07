import { startJobs } from "../src/lib/jobs";
import { writeFile } from "node:fs/promises";

startJobs({ keepAlive: true, heartbeat: async () => {
  if (process.env.WORKER_HEARTBEAT_FILE)
    await writeFile(process.env.WORKER_HEARTBEAT_FILE, String(Date.now()), { mode: 0o600 });
} });
console.log("Order, payment and notification workers started.");
