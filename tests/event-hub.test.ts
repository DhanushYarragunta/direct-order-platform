import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventHub, type StreamAudience } from "../src/lib/event-hub";
import { kitchenUrgency } from "../src/lib/kitchen-display";

const menu: StreamAudience = { scope: "menu", outletId: "kondapur" };
const kitchen: StreamAudience = { scope: "kitchen", outletId: "kondapur" };
const member = (sessionId: string | null = null) => ({ sessionId, send: vi.fn(), close: vi.fn() });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("shared event poller", () => {
  it("shares a single revision query across 100 menu subscribers and stops after the final departure", async () => {
    const revision = vi.fn(async () => "v1"), authorize = vi.fn(async () => new Set<string>());
    const hub = createEventHub({ revision, authorize });
    const listeners = Array.from({ length: 100 }, () => member());
    const leave = listeners.map((listener) => hub.subscribe(menu, listener));
    await vi.advanceTimersByTimeAsync(0);
    expect(revision).toHaveBeenCalledTimes(1);
    expect(authorize).not.toHaveBeenCalled();
    expect(listeners.every((listener) => listener.send.mock.calls[0]?.[0] === "message")).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(revision).toHaveBeenCalledTimes(2);
    expect(listeners[0].send.mock.calls[1]?.[0]).toBe("heartbeat");
    leave.slice(0, 99).forEach((unsubscribe) => unsubscribe());
    expect(hub.channelCount()).toBe(1);
    leave[99]();
    expect(hub.channelCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(9000);
    expect(revision).toHaveBeenCalledTimes(2);
  });
  it("batches session checks and removes revoked sessions before sending changes", async () => {
    const revision = vi.fn(async () => "v1");
    const authorize = vi.fn(async (_audience: StreamAudience, _members: unknown[]) => new Set(["allowed"]));
    const hub = createEventHub({ revision, authorize });
    const allowed = member("allowed"), revoked = member("revoked");
    const leave = hub.subscribe(kitchen, allowed);
    hub.subscribe(kitchen, revoked);
    await vi.advanceTimersByTimeAsync(0);
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0]?.[1]).toHaveLength(2);
    expect(revoked.close).toHaveBeenCalledOnce();
    expect(revoked.send).not.toHaveBeenCalled();
    expect(allowed.send).toHaveBeenCalledOnce();
    authorize.mockResolvedValue(new Set());
    await vi.advanceTimersByTimeAsync(3000);
    expect(allowed.close).toHaveBeenCalledOnce();
    expect(hub.channelCount()).toBe(0);
    expect(revision).toHaveBeenCalledTimes(1);
    leave();
  });
  it("isolates order streams by customer and kitchen streams by outlet", async () => {
    const revision = vi.fn(async (audience: StreamAudience) => audience.userId || audience.outletId);
    const hub = createEventHub({ revision, authorize: async () => new Set(["s"]) });
    const first = member("s"), second = member("s");
    const leave = [
      hub.subscribe({ scope: "orders", outletId: "ignored", userId: "customer-a" }, first),
      hub.subscribe({ scope: "orders", outletId: "ignored", userId: "customer-b" }, second),
      hub.subscribe(kitchen, member("s")),
      hub.subscribe({ ...kitchen, outletId: "kukatpally" }, member("s")),
    ];
    await vi.advanceTimersByTimeAsync(0);
    expect(hub.channelCount()).toBe(4);
    expect(first.send.mock.calls[0]?.[1]).toMatchObject({ revision: "customer-a" });
    expect(second.send.mock.calls[0]?.[1]).toMatchObject({ revision: "customer-b" });
    leave.forEach((unsubscribe) => unsubscribe());
  });
  it("signals a database outage and recovers on the next shared poll", async () => {
    const revision = vi.fn().mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValue("recovered");
    const hub = createEventHub({ revision, authorize: async () => new Set() });
    const listener = member(), leave = hub.subscribe(menu, listener);
    await vi.advanceTimersByTimeAsync(0);
    expect(listener.send.mock.calls[0]?.[0]).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(3000);
    expect(listener.send.mock.calls[1]).toMatchObject(["message", { revision: "recovered" }]);
    leave();
  });
  it("does not overlap slow polls or deliver to subscribers that left during a query", async () => {
    let resolve: (value: string) => void = () => {};
    const revision = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const hub = createEventHub({ revision, authorize: async () => new Set() });
    const listener = member(), leave = hub.subscribe(menu, listener);
    await vi.advanceTimersByTimeAsync(9000);
    expect(revision).toHaveBeenCalledOnce();
    leave(); resolve("late-result");
    await vi.advanceTimersByTimeAsync(0);
    expect(listener.send).not.toHaveBeenCalled();
    expect(hub.channelCount()).toBe(0);
  });
});

describe("kitchen urgency", () => {
  const now = Date.parse("2026-11-05T08:00:00Z");
  it("uses green above five minutes and amber throughout the final five minutes", () => {
    expect(kitchenUrgency("PLACED", new Date(now + 300001).toISOString(), now).tone).toBe("on-time");
    expect(kitchenUrgency("PREPARING", new Date(now + 300000).toISOString(), now)).toMatchObject({ tone: "due-soon", remaining: 5 });
  });
  it("shows strong overdue state immediately after the promise, even under one minute", () => {
    expect(kitchenUrgency("PREPARING", new Date(now - 1).toISOString(), now)).toMatchObject({ tone: "late", remaining: -1 });
  });
  it("does not flag ready/delivery orders as late cooking and exposes missing promises", () => {
    expect(kitchenUrgency("READY", new Date(now - 3600000).toISOString(), now).tone).toBe("on-time");
    expect(kitchenUrgency("OUT_FOR_DELIVERY", new Date(now - 3600000).toISOString(), now).label).toBe("Preparation complete");
    expect(kitchenUrgency("PLACED", null, now).label).toBe("Promise unavailable");
  });
});
