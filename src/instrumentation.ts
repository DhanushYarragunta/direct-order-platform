export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.RUN_BACKGROUND_JOBS !== "false"
  ) {
    const { startJobs } = await import("./lib/jobs");
    startJobs();
  }
}
