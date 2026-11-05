import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

// Run only against an expendable, seeded test environment. This script creates
// synthetic accounts and paid TEST orders; it never provisions or resets a DB.
if (process.env.PERF_ACKNOWLEDGE_WRITES !== "synthetic-orders-only") {
  throw new Error("Set PERF_ACKNOWLEDGE_WRITES=synthetic-orders-only after selecting an expendable test database. This run writes synthetic orders.");
}
const target = new URL(process.env.PERF_BASE_URL || "http://127.0.0.1:3001");
if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/") {
  throw new Error("PERF_BASE_URL must be an HTTP(S) origin without credentials or a path.");
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && process.env.PERF_ENVIRONMENT !== "staging") {
  throw new Error("Remote targets require PERF_ENVIRONMENT=staging. Never run against a live customer database.");
}
const integer = (name, fallback, min, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
};
const seconds = integer("PERF_DURATION_SECONDS", 3600, 10, 86400);
const rate = integer("PERF_ORDERS_PER_HOUR", 1200, 1, 20000);
const concurrency = integer("PERF_CONCURRENCY", 12, 1, 100);
const customerCount = integer("PERF_CUSTOMERS", Math.max(12, Math.ceil(rate / 120)), 1, 500);
const menuCount = integer("PERF_MENU_STREAMS", 30, 0, 500);
const customerStreamCount = integer("PERF_CUSTOMER_STREAMS", Math.min(customerCount, 12), 0, customerCount);
const warmupSeconds = integer("PERF_WARMUP_SECONDS", 30, 0, 300);
const drainSeconds = integer("PERF_DRAIN_SECONDS", 15, 5, 300);
const requestBudget = integer("PERF_HTTP_P95_MS", 1000, 1, 60000);
const visibleBudget = integer("PERF_VISIBILITY_P95_MS", 8000, 1, 60000);
const scheduledCount = Math.floor(seconds * rate / 3600);
if (!scheduledCount || scheduledCount > 100000) throw new Error("Adjust duration/rate for between 1 and 100,000 scheduled orders.");
const origin = target.origin, runId = `load-${Date.now().toString(36)}`;
const outlets = ["kondapur", "gachibowli", "kukatpally"];
const lines = [{ itemId: "chicken-biryani", portion: "regular", quantity: 1, addOnIds: [] }];
const abort = new AbortController(), pending = new Map(), active = new Set();
const requests = [], workflows = [], visibility = [], arrivalLag = [], failures = [], streams = [], streamTasks = [];
const customers = [], kitchens = new Map();
let completed = 0, completedWithinWindow = 0, dropped = 0, measurementStart = 0, finishedAt = 0, interrupted = false;
const report = {
  runId, target: origin, environment: process.env.PERF_ENVIRONMENT || "local",
  startedAt: new Date().toISOString(), passed: false,
  scope: "Sustained synthetic pickup/test-payment load. SSE event-to-kitchen API visibility, not physical screen paint. No real gateway, cooking, delivery or human checkout timing.",
  machine: { platform: platform(), release: release(), node: process.version, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
  configuration: { seconds, rate, concurrency, customerCount, menuCount, customerStreamCount, warmupSeconds, drainSeconds, requestBudget, visibleBudget, scheduledCount },
};
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => sorted.length ? Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 100) / 100 : null;
  return { samples: sorted.length, median: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: percentile(1) };
}
function stop() { interrupted = true; abort.abort(); }
process.once("SIGINT", stop); process.once("SIGTERM", stop);

async function api(path, { method = "GET", data, session, operation, measured = false } = {}) {
  const started = performance.now();
  let status = 0;
  try {
    const response = await fetch(new URL(path, origin), {
      method, headers: { origin, ...(data ? { "Content-Type": "application/json" } : {}), ...(session?.cookie ? { Cookie: session.cookie } : {}) },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
    });
    status = response.status;
    if (session) {
      const cookie = response.headers.getSetCookie().find((value) => value.startsWith("company_a_session="));
      if (cookie) session.cookie = cookie.split(";")[0];
    }
    const value = await response.json();
    if (!response.ok) throw new Error(`${operation || path}: HTTP ${status}${typeof value.error === "string" ? ` (${value.error})` : ""}`);
    return value;
  } finally {
    if (measured) requests.push({ operation, status, ms: performance.now() - started, ok: status >= 200 && status < 300 });
  }
}
async function refreshKitchen(outletId) {
  const data = await api(`/api/staff/orders?outlet=${outletId}`, { session: kitchens.get(outletId) });
  if (!data.orders.every((order) => order.outletId === outletId)) throw new Error("Cross-outlet kitchen data detected");
  const now = performance.now();
  for (const order of data.orders) {
    const record = pending.get(order.id);
    if (record && order.paymentStatus === "PAID" && order.status !== "PENDING_PAYMENT") {
      record.seenAt ??= now;
      if (record.paidAt && !record.counted) { visibility.push(Math.max(0, record.seenAt - record.paidAt)); record.counted = true; }
    }
  }
}
function startStream(scope, outletId, session) {
  const stats = { scope, outletId, messages: 0, heartbeats: 0, reconnects: 0, errors: 0, lastEventAt: 0, maximumGapMs: 0 };
  streams.push(stats);
  const task = (async () => {
    while (!abort.signal.aborted) {
      try {
        const response = await fetch(`${origin}/api/events?scope=${scope}&outlet=${outletId}`, {
          headers: session?.cookie ? { Cookie: session.cookie } : {}, signal: abort.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Stream HTTP ${response.status}`);
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "";
        try {
          while (!abort.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            let end;
            while ((end = buffer.indexOf("\n\n")) !== -1) {
              const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
              if (!event.includes("data:")) continue;
              if (event.includes("event: unavailable")) { stats.errors++; continue; }
              const now = performance.now();
              if (stats.lastEventAt) stats.maximumGapMs = Math.max(stats.maximumGapMs, now - stats.lastEventAt);
              stats.lastEventAt = now;
              if (event.includes("event: heartbeat")) stats.heartbeats++;
              else {
                stats.messages++;
                if (scope === "kitchen") await refreshKitchen(outletId);
              }
            }
          }
        } finally { await reader.cancel().catch(() => {}); }
      } catch (error) {
        if (!abort.signal.aborted) { stats.errors++; if (stats.errors <= 3) console.error(`${scope}/${outletId}: ${error.message}`); }
      }
      if (!abort.signal.aborted) { stats.reconnects++; await delay(3000, undefined, { signal: abort.signal }).catch(() => {}); }
    }
  })();
  streamTasks.push(task);
}
async function order(index) {
  const start = performance.now(), outletId = outlets[index % outlets.length], session = customers[index % customers.length];
  try {
    const quote = await api("/api/checkout/quote", { method: "POST", session, operation: "quote", measured: true, data: { outletId, lines } });
    const created = await api("/api/orders", { method: "POST", session, operation: "checkout", measured: true, data: {
      outletId, lines, checkoutKey: randomUUID(), fulfillment: "pickup", phone: "9000000000", note: `Synthetic load ${runId}`,
    } });
    if (created.totalPaise !== quote.totalPaise || created.outletId !== outletId) throw new Error("Quote/order total or routing mismatch");
    const record = { outletId, paidAt: 0, seenAt: null, counted: false };
    pending.set(created.id, record);
    const paid = await api(`/api/orders/${created.id}/payment`, { method: "POST", session, operation: "payment", measured: true, data: { attemptKey: randomUUID(), method: index % 2 ? "CARD" : "UPI", outcome: "success" } });
    if (paid.paymentStatus !== "PAID" || paid.status !== "PLACED" || paid.outletId !== outletId) throw new Error("Paid workflow did not reach its assigned kitchen");
    record.paidAt = performance.now();
    if (record.seenAt) { visibility.push(Math.max(0, record.seenAt - record.paidAt)); record.counted = true; }
    completed++;
    if (performance.now() <= measurementStart + seconds * 1000) completedWithinWindow++;
    workflows.push(performance.now() - start);
  } catch (error) { failures.push({ order: index + 1, message: error.message }); }
}
try {
  // The explicit demo endpoint is a preflight gate: it must be enabled only on
  // the expendable environment, so this cannot invoke a live payment gateway.
  for (const outlet of outlets) {
    const session = {};
    await api("/api/auth/demo", { method: "POST", session, data: { account: `kitchen-${outlet}` } });
    kitchens.set(outlet, session);
    await api(`/api/menu?outlet=${outlet}`);
  }
  for (let i = 0; i < customerCount; i++) {
    const session = {};
    await api("/api/auth/register", { method: "POST", session, data: { name: "Synthetic load customer", email: `${runId}-${i}@load.example`, password: randomUUID(), consent: true } });
    customers.push(session);
  }
  for (const outlet of outlets) startStream("kitchen", outlet, kitchens.get(outlet));
  for (let i = 0; i < menuCount; i++) startStream("menu", outlets[i % outlets.length]);
  for (let i = 0; i < customerStreamCount; i++) startStream("orders", outlets[i % outlets.length], customers[i]);
  console.log(`Warmup ${warmupSeconds}s; ${streams.length} streams. Target: ${origin}; run: ${runId}`);
  await delay(Math.max(warmupSeconds, 5) * 1000, undefined, { signal: abort.signal });
  if (streams.some((stream) => stream.messages === 0)) throw new Error("At least one stream did not deliver an initial revision");
  measurementStart = performance.now();
  const spacing = 3600000 / rate;
  let lastProgress = measurementStart;
  for (let i = 0; i < scheduledCount && !abort.signal.aborted; i++) {
    await delay(Math.max(0, measurementStart + i * spacing - performance.now()), undefined, { signal: abort.signal });
    arrivalLag.push(performance.now() - (measurementStart + i * spacing));
    if (active.size >= concurrency) dropped++;
    else {
      const task = order(i).finally(() => active.delete(task));
      active.add(task);
    }
    if (performance.now() - lastProgress >= 60000) {
      console.log(`${Math.round((performance.now() - measurementStart) / 1000)}s: ${completed} paid, ${failures.length} failed, ${dropped} dropped, ${active.size} in flight`);
      lastProgress = performance.now();
    }
  }
  await delay(Math.max(0, measurementStart + seconds * 1000 - performance.now()), undefined, { signal: abort.signal });
  await Promise.allSettled([...active]);
  await delay(drainSeconds * 1000, undefined, { signal: abort.signal });
  finishedAt = performance.now();
  const missing = [...pending.values()].filter((record) => record.paidAt && !record.counted).length;
  const latency = summary(requests.filter((request) => request.ok).map((request) => request.ms));
  const visible = summary(visibility);
  const unhealthyStreams = streams.filter((stream) => !stream.messages || finishedAt - stream.lastEventAt > 15000 || stream.maximumGapMs > 15000).length;
  report.acceptance = {
    noFailedWorkflows: failures.length === 0, noDroppedArrivals: dropped === 0,
    completedAllScheduled: completed === scheduledCount, noMissingKitchenOrders: missing === 0,
    httpP95WithinBudget: latency.p95 !== null && latency.p95 <= requestBudget,
    visibilityP95WithinBudget: visible.p95 !== null && visible.p95 <= visibleBudget,
    allStreamsHealthy: unhealthyStreams === 0, generatorKeptPace: Math.max(...arrivalLag) < 1000,
  };
  report.passed = Object.values(report.acceptance).every(Boolean);
  report.missingKitchenOrders = missing;
} catch (error) { report.fatalError = error.message; }
finally {
  finishedAt ||= performance.now();
  abort.abort(); await Promise.allSettled(streamTasks); await Promise.allSettled([...active]);
  Object.assign(report, {
    finishedAt: new Date().toISOString(), interrupted, completed, completedWithinWindow, dropped,
    elapsedMeasurementSeconds: measurementStart ? (finishedAt - measurementStart) / 1000 : 0,
    httpErrorRate: requests.length ? requests.filter((request) => !request.ok).length / requests.length : null,
    workflowMs: summary(workflows), arrivalLagMs: summary(arrivalLag), kitchenApiVisibilityMs: summary(visibility),
    operations: Object.fromEntries(["quote", "checkout", "payment"].map((operation) => [operation, summary(requests.filter((request) => request.operation === operation && request.ok).map((request) => request.ms))])),
    streams: streams.map(({ lastEventAt, ...stream }) => ({ ...stream, finalSilenceMs: lastEventAt ? Math.max(0, finishedAt - lastEventAt) : null })), failures,
    cleanup: `Synthetic accounts use ${runId}-*@load.example; orders carry note Synthetic load ${runId}. Restore/dispose of this test database after collecting evidence.`,
  });
  mkdirSync(".local", { recursive: true });
  const path = `.local/sustained-${runId}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`${report.passed ? "PASS" : "FAIL"}: ${completed}/${scheduledCount} paid; report ${path}`);
  if (report.fatalError) console.error(report.fatalError);
  process.exitCode = report.passed && !interrupted ? 0 : 1;
}
