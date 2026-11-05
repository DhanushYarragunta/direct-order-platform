import { readFile } from "node:fs/promises";

try {
  if (process.argv.includes("--worker")) {
    const last = Number(await readFile(process.env.WORKER_HEARTBEAT_FILE || "/tmp/deccan-worker-heartbeat", "utf8"));
    if (!Number.isFinite(last) || Date.now() - last > 30_000) throw new Error("Stale worker");
  } else {
    const response = await fetch(`http://127.0.0.1:${process.env.PORT || "3000"}/api/health`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok || (await response.json()).status !== "ok") throw new Error("Unhealthy web process");
  }
} catch { process.exitCode = 1; }
