import { runOrderJobs } from "./orders";
import { cleanExpiredOtp } from "./privacy";
const state = globalThis as unknown as {
  orderJobTimer?: ReturnType<typeof setInterval>;
};
export function startJobs() {
  if (state.orderJobTimer) return;
  let running = false,
    lastError = 0,
    lastMaintenance = 0;
  state.orderJobTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runOrderJobs();
      if (Date.now() - lastMaintenance >= 60_000) {
        await cleanExpiredOtp();
        lastMaintenance = Date.now();
      }
    } catch {
      if (Date.now() - lastError > 60000) {
        console.error(
          "Order worker cannot reach the database. Check database setup.",
        );
        lastError = Date.now();
      }
    } finally {
      running = false;
    }
  }, 3000);
  state.orderJobTimer.unref();
}
