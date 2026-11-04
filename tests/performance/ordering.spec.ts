import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform, release } from "node:os";

const databaseName = process.env.CORE_TEST_DATABASE;
const databaseUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (!databaseName || !/^deccan_test_[a-f0-9]{12}$/.test(databaseName) || !databaseUrl
  || databaseUrl.pathname !== `/${databaseName}`
  || !["127.0.0.1", "localhost"].includes(databaseUrl.hostname)
  || databaseUrl.port !== "55432") {
  throw new Error("Performance checks require the isolated database created by npm run test:performance.");
}

const origin = "http://127.0.0.1:3001";
const outlets = ["kondapur", "gachibowli", "kukatpally"];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
const lines = [{ itemId: "chicken-biryani", portion: "regular", quantity: 1, addOnIds: [] }];
type Order = { id: string; number: string; outletId: string; status: string; paymentStatus: string; totalPaise: number };
type Sample = { operation: string; milliseconds: number; status: number; ok: boolean };
const machine = { platform: platform(), release: release(), architecture: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, node: process.version };

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? Math.round(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] * 10) / 10 : null;
  return { samples: sorted.length, medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: percentile(1) };
}
function save(name: string, report: unknown) {
  mkdirSync(".local", { recursive: true });
  writeFileSync(`.local/${name}.json`, JSON.stringify(report, null, 2));
}
async function demo(context: BrowserContext, account: string) {
  const response = await context.request.post("/api/auth/demo", { headers: { origin }, data: { account } });
  expect(response.ok()).toBeTruthy();
}
async function register(api: APIRequestContext) {
  const response = await api.post("/api/auth/register", {
    headers: { origin },
    data: { name: "Synthetic customer", email: `performance-${randomUUID()}@deccan.example`, password: randomUUID(), consent: true },
  });
  expect(response.status()).toBe(201);
}

test("paced local order throughput with live kitchen screens", async ({ browser, playwright }) => {
  // Three simultaneous arrivals every nine seconds = 1,200 orders/hour offered load.
  // This bounded local sample is not a production capacity or soak-test claim.
  const orderCount = 30, windowMs = 90000, burstMs = 9000;
  const samples: Sample[] = [], workflows: number[] = [], visible: number[] = [], arrivalLag: number[] = [];
  const failures: string[] = [];
  const customers: APIRequestContext[] = [], kitchens: BrowserContext[] = [];
  let completed = 0, completedWithinWindow = 0, elapsedMs = 0, passed = false;
  const startedAt = new Date().toISOString();
  const screens: { context: BrowserContext; page: Awaited<ReturnType<BrowserContext["newPage"]>>; outletId: string }[] = [];
  async function post<T>(api: APIRequestContext, path: string, operation: string, data: unknown): Promise<T> {
    const start = performance.now();
    let recorded = false;
    try {
      const response = await api.post(path, { headers: { origin }, data, timeout: 10000 });
      samples.push({ operation, milliseconds: performance.now() - start, status: response.status(), ok: response.ok() });
      recorded = true;
      if (!response.ok()) throw new Error(`${operation} returned HTTP ${response.status()}`);
      return await response.json() as T;
    } catch (error) {
      // HTTP failures are already counted; transport failures carry status zero.
      if (!recorded) samples.push({ operation, milliseconds: performance.now() - start, status: 0, ok: false });
      throw error;
    }
  }
  try {
    for (let i = 0; i < 6; i++) {
      const api = await playwright.request.newContext({ baseURL: origin });
      customers.push(api);
      await register(api);
    }
    for (const outletId of outlets) {
      const context = await browser.newContext({ baseURL: origin });
      kitchens.push(context);
      await demo(context, `kitchen-${outletId}`);
      const page = await context.newPage();
      // Count events from the application's own EventSource; no extra stream is opened.
      await page.addInitScript(() => {
        const NativeEventSource = window.EventSource;
        const state = window as unknown as { kitchenEvents: number };
        state.kitchenEvents = 0;
        window.EventSource = class extends NativeEventSource {
          constructor(url: string | URL, options?: EventSourceInit) {
            super(url, options);
            if (String(url).includes("scope=kitchen")) this.addEventListener("message", () => state.kitchenEvents++);
          }
        };
      });
      await page.goto("/kitchen");
      await expect.poll(() => page.evaluate(() => (window as unknown as { kitchenEvents: number }).kitchenEvents)).toBeGreaterThan(0);
      screens.push({ context, page, outletId });
    }
    // Warm the catalogue before timing writes; record this explicitly in the report.
    for (const outletId of outlets) expect((await customers[0].get(`/api/menu?outlet=${outletId}`)).ok()).toBeTruthy();
    const start = performance.now();
    const jobs: Promise<void>[] = [];
    for (let burst = 0; burst < orderCount / 3; burst++) {
      await sleep(start + burst * burstMs - performance.now());
      for (let slot = 0; slot < 3; slot++) {
        const index = burst * 3 + slot, outletId = outlets[slot], api = customers[index % customers.length];
        jobs.push((async () => {
          const begin = performance.now();
          arrivalLag.push(begin - (start + burst * burstMs));
          try {
            const quote = await post<{ totalPaise: number }>(api, "/api/checkout/quote", "quote", { outletId, lines });
            const order = await post<Order>(api, "/api/orders", "checkout", { outletId, lines, checkoutKey: randomUUID(), fulfillment: "pickup", phone: "9000000000" });
            expect(order.totalPaise).toBe(quote.totalPaise);
            const paid = await post<Order>(api, `/api/orders/${order.id}/payment`, "payment", { attemptKey: randomUUID(), method: index % 2 ? "CARD" : "UPI", outcome: "success" });
            expect(paid.status).toBe("PLACED");
            expect(paid.paymentStatus).toBe("PAID");
            expect(paid.outletId).toBe(outletId);
            completed++;
            if (performance.now() - start <= windowMs) completedWithinWindow++;
            workflows.push(performance.now() - begin);
            const visibilityStart = performance.now();
            await expect(screens[slot].page.locator(".kitchen-ticket").filter({ hasText: order.number })).toBeVisible({ timeout: 8000 });
            visible.push(performance.now() - visibilityStart);
          } catch (error) {
            failures.push(`Order ${index + 1}: ${error instanceof Error ? error.message.split("\n")[0] : "failed"}`);
          }
        })());
      }
    }
    await sleep(start + windowMs - performance.now());
    await Promise.all(jobs);
    elapsedMs = performance.now() - start;
    expect(failures).toEqual([]);
    expect(completedWithinWindow).toBe(orderCount);
    expect(Math.max(...arrivalLag)).toBeLessThan(1000);
    for (const screen of screens) {
      const response = await screen.context.request.get(`/api/staff/orders?outlet=${screen.outletId}`);
      expect(response.ok()).toBeTruthy();
      const data = await response.json() as { orders: Order[] };
      expect(data.orders.every((order) => order.outletId === screen.outletId)).toBeTruthy();
      expect(await screen.page.evaluate(() => (window as unknown as { kitchenEvents: number }).kitchenEvents)).toBeGreaterThan(1);
    }
    passed = true;
  } finally {
    const sseEvents = await Promise.all(screens.map(async ({ page, outletId }) => ({ outletId, events: await page.evaluate(() => (window as unknown as { kitchenEvents: number }).kitchenEvents).catch(() => 0) })));
    save("performance-throughput", {
      startedAt, finishedAt: new Date().toISOString(), passed, machine,
      scope: "Local production build; six authenticated synthetic customers, three kitchens with live SSE, warm catalogue, immediate simulated payment. No delivery, external gateways, WAN latency or physical preparation.",
      offeredOrdersPerHour: 1200, scheduledOrders: orderCount, observationWindowMs: windowMs,
      arrivalPattern: "Three concurrent orders every nine seconds for ten bursts", elapsedMs: Math.round(elapsedMs),
      completed, completedWithinWindow, completionRatePerHour: completedWithinWindow * 3600000 / windowMs,
      httpErrorRate: samples.length ? samples.filter((sample) => !sample.ok).length / samples.length : null,
      requests: samples.length, arrivalLag: summary(arrivalLag), orderWorkflow: summary(workflows), kitchenVisibility: summary(visible),
      operations: Object.fromEntries(["quote", "checkout", "payment"].map((operation) => [operation, summary(samples.filter((sample) => sample.operation === operation && sample.ok).map((sample) => sample.milliseconds))])),
      sseEvents, failures, samples,
    });
    await Promise.all([...customers.map((api) => api.dispose()), ...kitchens.map((context) => context.close())]);
  }
});

test("automated mobile menu-to-paid-order timing", async ({ browser }) => {
  const durations: number[] = [];
  let passed = false;
  try {
    for (let iteration = 0; iteration < 5; iteration++) {
      const context = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      try {
        await register(context.request);
        const page = await context.newPage();
        await page.goto("/");
        await expect(page.getByRole("button", { name: "Add Chicken dum biryani", exact: true })).toBeEnabled();
        const start = performance.now();
        await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
        await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
        await page.getByRole("link", { name: "Continue to checkout" }).click();
        await page.getByLabel("Mobile number").fill("9000000000");
        await page.getByRole("button", { name: /Continue to payment/ }).click();
        await expect(page.getByRole("heading", { name: "One last step." })).toBeVisible();
        if (iteration % 2) await page.getByRole("button", { name: "Card", exact: true }).click();
        await page.getByRole("button", { name: /Pay ₹/ }).click();
        await expect(page).toHaveURL(/\/orders\/[^/]+$/);
        await expect(page.locator(".order-detail-heading")).toBeVisible();
        durations.push(performance.now() - start);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      } finally { await context.close(); }
    }
    passed = true;
  } finally {
    save("performance-checkout", {
      finishedAt: new Date().toISOString(), passed, machine, viewport: { width: 390, height: 844 },
      scope: "Automated signed-in pickup flow from ready menu/add dish to paid tracking page, five fresh browser contexts, no typing/decision time, local network, immediate test payment. Excludes registration and initial menu load. Not a human checkout median or proof of the sub-60-second usability target.",
      menuToPaidOrder: summary(durations), durationsMs: durations.map((value) => Math.round(value)),
    });
  }
});
