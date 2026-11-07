import { afterEach, beforeEach, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ upsert: vi.fn(), deleteMany: vi.fn() }));
vi.mock("../src/lib/db", () => ({ db: { workerStatus: database } }));
import { createWorkerReporter, persistWorkerStatus, summarizeWorkers, WORKER_RETENTION_MS, type WorkerStatusRecord } from "../src/lib/worker-status";

const now = new Date("2026-11-07T08:00:00Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);
const record = (job: string, overrides: Partial<WorkerStatusRecord> = {}): WorkerStatusRecord => ({
  processId: "worker-a", job, startedAt: ago(5), finishedAt: ago(4), succeededAt: ago(4),
  failedAt: null, consecutiveFailures: 0, lastErrorCode: null, updatedAt: ago(4), ...overrides,
});
const flushPromises = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

beforeEach(() => {
  database.upsert.mockResolvedValue({});
  database.deleteMany.mockResolvedValue({ count: 0 });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.resetAllMocks(); });

it("reports every lane as unreported without recent worker evidence", () => {
  const workers = summarizeWorkers([], now);
  expect(workers.map(({ job, status }) => ({ job, status }))).toEqual([
    { job: "orders", status: "unreported" }, { job: "payments", status: "unreported" },
    { job: "notifications", status: "unreported" },
  ]);
  expect(workers.every((worker) => worker.instances.length === 0 && worker.lastSucceededAt === null)).toBe(true);
  expect(summarizeWorkers([record("orders", { updatedAt: new Date(now.getTime() - WORKER_RETENTION_MS - 1) })], now)[0].status).toBe("unreported");
});

it("reports a stopped process as stale while preserving its last completed success", () => {
  const workers = summarizeWorkers([record("orders", { updatedAt: ago(91), startedAt: ago(93), finishedAt: ago(92), succeededAt: ago(92) })], now);
  expect(workers[0]).toMatchObject({ status: "stale", lastSucceededAt: ago(92).toISOString(), staleAfterSeconds: 90 });
});

it("ignores wholly stale replaced processes but never masks a current process's stalled lane", () => {
  const retired = record("payments", { processId: "retired", updatedAt: ago(3600) });
  const healthy = record("payments", { processId: "healthy-worker" });
  expect(summarizeWorkers([retired, healthy], now)[1]).toMatchObject({ status: "healthy", instances: [{ processId: "healthy-worker" }] });
  const stalled = record("payments", { processId: "stuck-worker", startedAt: ago(901), finishedAt: ago(920), updatedAt: ago(901) });
  const stillAlive = record("orders", { processId: "stuck-worker" });
  const payment = summarizeWorkers([retired, healthy, stalled, stillAlive], now)[1];
  expect(payment.status).toBe("stalled");
  expect(payment.instances.map(({ processId, status }) => ({ processId, status }))).toEqual([
    { processId: "healthy-worker", status: "healthy" }, { processId: "stuck-worker", status: "stalled" },
  ]);
});

it("allows bounded long provider batches and flags missing or inactive lanes", () => {
  const workers = summarizeWorkers([
    record("orders"),
    record("payments", { startedAt: ago(600), finishedAt: ago(700), updatedAt: ago(600) }),
    record("notifications", { startedAt: ago(240), finishedAt: ago(250), updatedAt: ago(240) }),
  ], now);
  expect(workers.map((worker) => worker.status)).toEqual(["healthy", "running", "running"]);
  expect(workers.map((worker) => worker.stallAfterSeconds)).toEqual([120, 900, 300]);
  const inactive = summarizeWorkers([record("orders"), record("payments", { updatedAt: ago(91) })], now);
  expect(inactive[1].status).toBe("stale");
  expect(inactive[2].status).toBe("unreported");
});

it("exposes failure counts without serializing arbitrary error details", () => {
  const failure = record("notifications", { failedAt: ago(4), consecutiveFailures: 3, lastErrorCode: "provider response with customer email" });
  const worker = summarizeWorkers([failure], now)[2];
  expect(worker).toMatchObject({ status: "failed", consecutiveFailures: 3, lastFailedAt: ago(4).toISOString(), lastErrorCode: "JOB_FAILED" });
  expect(JSON.stringify(worker)).not.toContain("customer email");
});

it("persists independent process/job rows with sanitized diagnostics", async () => {
  await persistWorkerStatus(record("payments", { lastErrorCode: "private exception details" }));
  const input = database.upsert.mock.calls[0][0];
  expect(input.where).toEqual({ processId_job: { processId: "worker-a", job: "payments" } });
  expect(input.create.lastErrorCode).toBe("JOB_FAILED");
  expect(input.update).toEqual(input.create);
  expect(JSON.stringify(input)).not.toContain("private");
  await expect(persistWorkerStatus(record("unknown"))).rejects.toThrow("Unknown worker job");
});

it("coalesces a stalled telemetry write without blocking events or another lane", async () => {
  let release!: () => void;
  database.upsert.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
  const report = createWorkerReporter("process-coalesced");
  expect(report("orders", "started", ago(5))).toBeUndefined();
  report("orders", "succeeded", ago(4));
  report("orders", "started", ago(2));
  report("orders", "succeeded", ago(1));
  expect(database.upsert).toHaveBeenCalledTimes(1);
  report("notifications", "started", now);
  expect(database.upsert).toHaveBeenCalledTimes(2);
  release(); await flushPromises();
  expect(database.upsert).toHaveBeenCalledTimes(3);
  expect(database.upsert.mock.calls[2][0].update).toMatchObject({
    processId: "process-coalesced", job: "orders", startedAt: ago(2), succeededAt: ago(1), updatedAt: ago(1),
  });
});

it("recovers reporting after database failure and retains job failure history", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  database.upsert.mockRejectedValueOnce(new Error("database password"));
  const report = createWorkerReporter("process-recovery");
  report("payments", "started", ago(10)); await flushPromises();
  report("payments", "failed", ago(9)); await flushPromises();
  report("payments", "started", ago(6)); await flushPromises();
  report("payments", "failed", ago(5)); await flushPromises();
  expect(database.upsert.mock.calls.at(-1)![0].update).toMatchObject({ consecutiveFailures: 2, lastErrorCode: "JOB_FAILED", failedAt: ago(5) });
  report("payments", "started", ago(2)); await flushPromises();
  report("payments", "succeeded", ago(1)); await flushPromises();
  expect(database.upsert.mock.calls.at(-1)![0].update).toMatchObject({ consecutiveFailures: 0, lastErrorCode: null, succeededAt: ago(1), failedAt: ago(5) });
  expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain("password");
});

it("prunes seven-day-old reports at most hourly and does not propagate pruning failures", async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.spyOn(console, "error").mockImplementation(() => {});
  database.deleteMany.mockRejectedValueOnce(new Error("prune unavailable"));
  const report = createWorkerReporter("pruner");
  report("orders", "started"); await flushPromises();
  report("notifications", "started"); await flushPromises();
  expect(database.deleteMany).toHaveBeenCalledTimes(1);
  expect(database.deleteMany).toHaveBeenCalledWith({ where: { updatedAt: { lt: new Date(now.getTime() - WORKER_RETENTION_MS) } } });
  vi.setSystemTime(new Date(now.getTime() + 3600_000));
  report("orders", "succeeded"); await flushPromises();
  expect(database.deleteMany).toHaveBeenCalledTimes(2);
});
