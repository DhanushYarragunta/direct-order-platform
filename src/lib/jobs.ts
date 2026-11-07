import { runOrderJobs } from "./orders";
import { cleanExpiredOtp } from "./privacy";
import { runGatewayJobs } from "./gateway-payments";
import { runNotificationJobs } from "./notifications";
import { createWorkerReporter, type WorkerJob } from "./worker-status";

const state = globalThis as unknown as { serviceJobTimers?: ReturnType<typeof setInterval>[] };

/** Each queue has an independent in-flight guard so provider outages cannot stall kitchen alerts. */
export function startJobs(options: { keepAlive?: boolean; heartbeat?: () => Promise<void> } = {}) {
  if (state.serviceJobTimers) return;
  const reporter = createWorkerReporter();
  let lastTelemetryError = -Infinity;
  const report: ReturnType<typeof createWorkerReporter> = (...args) => {
    try { reporter(...args); }
    catch {
      if (Date.now() - lastTelemetryError >= 60_000) {
        console.error("Worker status reporting is unavailable. Job execution will continue.");
        lastTelemetryError = Date.now();
      }
    }
  };
  let lastMaintenance = 0;
  const tasks = [
    { job: "orders", name: "Order maintenance", interval: 3000, work: async () => {
      await runOrderJobs();
      if (Date.now() - lastMaintenance >= 60_000) { await cleanExpiredOtp(); lastMaintenance = Date.now(); }
      await options.heartbeat?.();
    } },
    { job: "payments", name: "Payment reconciliation", interval: 5000, work: runGatewayJobs },
    { job: "notifications", name: "Notification delivery", interval: 3000, work: runNotificationJobs },
  ] satisfies { job: WorkerJob; name: string; interval: number; work: () => Promise<unknown> }[];
  state.serviceJobTimers = tasks.map(({ job, name, interval, work }) => {
    let running = false, lastError = 0;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      report(job, "started");
      try { await work(); report(job, "succeeded"); }
      catch {
        report(job, "failed");
        if (Date.now() - lastError >= 60_000) { console.error(`${name} requires attention. Check service configuration and queues.`); lastError = Date.now(); }
      } finally { running = false; }
    }, interval);
    if (!options.keepAlive) timer.unref();
    return timer;
  });
}
