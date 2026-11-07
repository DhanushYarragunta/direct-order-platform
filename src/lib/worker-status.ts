import { randomUUID } from "node:crypto";
import { db } from "./db";

export const WORKER_RETENTION_MS = 7 * 86400_000;
export const WORKER_STALE_MS = 90_000;
const PRUNE_INTERVAL_MS = 3600_000;
export const WORKER_JOBS = ["orders", "payments", "notifications"] as const;
export type WorkerJob = typeof WORKER_JOBS[number];
export type WorkerHealth = "healthy" | "running" | "failed" | "stalled" | "stale" | "unreported";
const labels: Record<WorkerJob, string> = {
  orders: "Order maintenance", payments: "Payment reconciliation", notifications: "Notification delivery",
};
// A payment pass can make many sequential provider calls. These are diagnostic
// thresholds, not execution timeouts, delivery confirmations or restart rules.
const stallAfterMs: Record<WorkerJob, number> = { orders: 120_000, payments: 900_000, notifications: 300_000 };

export type WorkerStatusRecord = {
  processId: string;
  job: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  succeededAt: Date | null;
  failedAt: Date | null;
  consecutiveFailures: number;
  lastErrorCode: string | null;
  updatedAt: Date;
};
type WorkerTimes = {
  lastReportedAt: string | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSucceededAt: string | null;
  lastFailedAt: string | null;
};
export type WorkerInstanceSummary = WorkerTimes & {
  processId: string;
  status: WorkerHealth;
  consecutiveFailures: number;
  lastErrorCode: "JOB_FAILED" | null;
};
export type WorkerJobSummary = WorkerTimes & {
  job: WorkerJob;
  label: string;
  status: WorkerHealth;
  consecutiveFailures: number;
  lastErrorCode: "JOB_FAILED" | null;
  staleAfterSeconds: number;
  stallAfterSeconds: number;
  instances: WorkerInstanceSummary[];
};
const iso = (value: Date | null | undefined) => value?.toISOString() || null;
const latest = (values: (string | null)[]) => values.filter((value): value is string => value !== null).sort().at(-1) || null;
const priority: WorkerHealth[] = ["stalled", "failed", "stale", "unreported", "running", "healthy"];

/** Compare every currently reporting process, rather than allowing one healthy
 * process to hide another process's stuck queue. A retired process is ignored
 * after a current replacement reports; absent replacements remain visibly stale. */
export function summarizeWorkers(records: WorkerStatusRecord[], now = new Date()): WorkerJobSummary[] {
  const relevant = records.filter((record) => (WORKER_JOBS as readonly string[]).includes(record.job)
    && record.updatedAt.getTime() >= now.getTime() - WORKER_RETENTION_MS);
  const processes = new Map<string, number>();
  for (const record of relevant) processes.set(record.processId, Math.max(processes.get(record.processId) || 0, record.updatedAt.getTime()));
  let processIds = [...processes].filter(([, timestamp]) => now.getTime() - timestamp <= WORKER_STALE_MS).map(([id]) => id);
  if (!processIds.length && processes.size)
    processIds = [[...processes].sort((a, b) => b[1] - a[1])[0][0]];
  return WORKER_JOBS.map((job) => {
    const instances: WorkerInstanceSummary[] = processIds.map((processId) => {
      const record = relevant.find((row) => row.processId === processId && row.job === job);
      const processStale = now.getTime() - processes.get(processId)! > WORKER_STALE_MS;
      const running = record?.startedAt && (!record.finishedAt || record.startedAt > record.finishedAt);
      const status: WorkerHealth = !record ? "unreported" : processStale ? "stale"
        : running ? now.getTime() - record.startedAt!.getTime() > stallAfterMs[job] ? "stalled" : "running"
        : now.getTime() - record.updatedAt.getTime() > WORKER_STALE_MS ? "stale"
        : record.consecutiveFailures > 0 ? "failed" : record.succeededAt ? "healthy" : "unreported";
      return { processId, status, lastReportedAt: iso(record?.updatedAt), lastStartedAt: iso(record?.startedAt),
        lastFinishedAt: iso(record?.finishedAt), lastSucceededAt: iso(record?.succeededAt), lastFailedAt: iso(record?.failedAt),
        consecutiveFailures: record?.consecutiveFailures || 0, lastErrorCode: record?.lastErrorCode ? "JOB_FAILED" : null };
    });
    return { job, label: labels[job],
      status: priority.find((status) => instances.some((instance) => instance.status === status)) || "unreported",
      lastReportedAt: latest(instances.map((instance) => instance.lastReportedAt)),
      lastStartedAt: latest(instances.map((instance) => instance.lastStartedAt)),
      lastFinishedAt: latest(instances.map((instance) => instance.lastFinishedAt)),
      lastSucceededAt: latest(instances.map((instance) => instance.lastSucceededAt)),
      lastFailedAt: latest(instances.map((instance) => instance.lastFailedAt)),
      consecutiveFailures: Math.max(0, ...instances.map((instance) => instance.consecutiveFailures)),
      lastErrorCode: instances.some((instance) => instance.lastErrorCode) ? "JOB_FAILED" : null,
      staleAfterSeconds: WORKER_STALE_MS / 1000, stallAfterSeconds: stallAfterMs[job] / 1000, instances };
  });
}

/** Persist only application-owned diagnostic fields. Never save exception text,
 * provider responses, credentials, destinations or customer/order information. */
export async function persistWorkerStatus(record: WorkerStatusRecord) {
  if (!(WORKER_JOBS as readonly string[]).includes(record.job)) throw new Error("Unknown worker job");
  const data = { processId: record.processId, job: record.job,
    startedAt: record.startedAt, finishedAt: record.finishedAt, succeededAt: record.succeededAt, failedAt: record.failedAt,
    consecutiveFailures: record.consecutiveFailures, lastErrorCode: record.lastErrorCode ? "JOB_FAILED" : null,
    updatedAt: record.updatedAt };
  return db.workerStatus.upsert({ where: { processId_job: { processId: record.processId, job: record.job } }, create: data, update: data });
}

export type WorkerEvent = "started" | "succeeded" | "failed";

/** Coalesce detached writes per lane. A slow/unavailable telemetry database can
 * hold at most one write and one latest snapshot per job, never actual job work. */
export function createWorkerReporter(processId: string = randomUUID()) {
  const states = new Map<WorkerJob, { record: WorkerStatusRecord; revision: number; writing: boolean }>();
  let lastPruneAt = -Infinity, pruning = false, lastWarningAt = -Infinity;
  const warn = () => {
    if (Date.now() - lastWarningAt < 60_000) return;
    lastWarningAt = Date.now();
    console.error("Worker status reporting is unavailable. Check the database and migrations.");
  };
  const flush = async (state: { record: WorkerStatusRecord; revision: number; writing: boolean }) => {
    if (state.writing) return;
    state.writing = true;
    try {
      let written: number;
      do {
        written = state.revision;
        try { await persistWorkerStatus({ ...state.record }); } catch { warn(); }
      } while (state.revision !== written);
    } finally { state.writing = false; }
  };
  return (job: WorkerJob, event: WorkerEvent, occurredAt = new Date()) => {
    let state = states.get(job);
    if (!state) {
      state = { revision: 0, writing: false, record: { processId, job, startedAt: null, finishedAt: null,
        succeededAt: null, failedAt: null, consecutiveFailures: 0, lastErrorCode: null, updatedAt: occurredAt } };
      states.set(job, state);
    }
    state.record = { ...state.record, updatedAt: occurredAt,
      ...(event === "started" ? { startedAt: occurredAt } : { finishedAt: occurredAt }),
      ...(event === "succeeded" ? { succeededAt: occurredAt, consecutiveFailures: 0, lastErrorCode: null } : {}),
      ...(event === "failed" ? { failedAt: occurredAt, consecutiveFailures: state.record.consecutiveFailures + 1, lastErrorCode: "JOB_FAILED" } : {}),
    };
    state.revision++;
    void flush(state);
    if (!pruning && Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS) {
      lastPruneAt = Date.now(); pruning = true;
      void db.workerStatus.deleteMany({ where: { updatedAt: { lt: new Date(Date.now() - WORKER_RETENTION_MS) } } })
        .catch(warn).finally(() => { pruning = false; });
    }
  };
}
