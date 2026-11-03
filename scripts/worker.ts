import { runOrderJobs } from "../src/lib/orders";
let running = false;
setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await runOrderJobs();
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
