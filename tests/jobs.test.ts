import { afterEach, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({ orders: vi.fn(), gateway: vi.fn(), notifications: vi.fn(), maintenance: vi.fn() }));
const reporting = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("../src/lib/orders", () => ({ runOrderJobs: jobs.orders }));
vi.mock("../src/lib/gateway-payments", () => ({ runGatewayJobs: jobs.gateway }));
vi.mock("../src/lib/notifications", () => ({ runNotificationJobs: jobs.notifications }));
vi.mock("../src/lib/privacy", () => ({ cleanExpiredOtp: jobs.maintenance }));
vi.mock("../src/lib/worker-status", () => ({ createWorkerReporter: () => reporting.report }));
import { startJobs } from "../src/lib/jobs";

afterEach(() => {
  const state = globalThis as unknown as { serviceJobTimers?: ReturnType<typeof setInterval>[] };
  for (const timer of state.serviceJobTimers || []) clearInterval(timer);
  delete state.serviceJobTimers;
  vi.useRealTimers();
  vi.resetAllMocks();
});

it("keeps kitchen maintenance and notification delivery running while the gateway is stalled", async () => {
  vi.useFakeTimers();
  jobs.orders.mockResolvedValue(undefined);
  jobs.notifications.mockResolvedValue(undefined);
  jobs.maintenance.mockResolvedValue(undefined);
  jobs.gateway.mockImplementation(() => new Promise(() => {}));
  const heartbeat = vi.fn().mockResolvedValue(undefined);
  startJobs({ heartbeat });
  await vi.advanceTimersByTimeAsync(16_000);
  expect(jobs.gateway).toHaveBeenCalledTimes(1);
  expect(jobs.orders.mock.calls.length).toBeGreaterThan(2);
  expect(jobs.notifications.mock.calls.length).toBeGreaterThan(2);
  expect(heartbeat.mock.calls.length).toBeGreaterThan(2);
  expect(reporting.report.mock.calls.filter(([job, event]) => job === "payments" && event === "started")).toHaveLength(1);
  expect(reporting.report.mock.calls.filter(([job, event]) => job === "payments" && event === "succeeded")).toHaveLength(0);
  expect(reporting.report).toHaveBeenCalledWith("orders", "succeeded");
  expect(reporting.report).toHaveBeenCalledWith("notifications", "succeeded");
});

it("continues actual jobs when telemetry throws and logs no error detail", async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  reporting.report.mockImplementation(() => { throw new Error("sensitive database connection string"); });
  jobs.orders.mockResolvedValue(undefined);
  jobs.gateway.mockResolvedValue(undefined);
  jobs.notifications.mockResolvedValue(undefined);
  jobs.maintenance.mockResolvedValue(undefined);
  startJobs();
  await vi.advanceTimersByTimeAsync(12_000);
  expect(jobs.orders.mock.calls.length).toBeGreaterThan(2);
  expect(jobs.gateway.mock.calls.length).toBeGreaterThan(1);
  expect(jobs.notifications.mock.calls.length).toBeGreaterThan(2);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls.flat().join(" ")).not.toContain("sensitive");
  log.mockRestore();
});

it("reports job failure and subsequent recovery without halting other lanes", async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  jobs.orders.mockResolvedValue(undefined);
  jobs.maintenance.mockResolvedValue(undefined);
  jobs.notifications.mockResolvedValue(undefined);
  jobs.gateway.mockRejectedValueOnce(new Error("private provider payload")).mockResolvedValue(undefined);
  startJobs();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(reporting.report.mock.calls.filter(([job]) => job === "payments")).toEqual([
    ["payments", "started"], ["payments", "failed"], ["payments", "started"], ["payments", "succeeded"],
  ]);
  expect(jobs.orders).toHaveBeenCalledTimes(3);
  expect(jobs.notifications).toHaveBeenCalledTimes(3);
  expect(log.mock.calls.flat().join(" ")).not.toContain("private");
  log.mockRestore();
});
