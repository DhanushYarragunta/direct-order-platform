import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = "http://127.0.0.1:3001";
async function demo(api: APIRequestContext, account: string) {
  expect((await api.post("/api/auth/demo", { headers: { origin }, data: { account } })).ok()).toBeTruthy();
}
async function paidOrder(api: APIRequestContext) {
  const response = await api.post("/api/orders", { headers: { origin }, data: {
    checkoutKey: crypto.randomUUID(), outletId: "kondapur", fulfillment: "pickup", phone: "9000000000",
    note: "Keep raita separate", lines: [{ itemId: "chicken-biryani", portion: "regular", quantity: 1, addOnIds: ["raita"] }],
  } });
  expect(response.ok()).toBeTruthy();
  const order = await response.json();
  expect((await api.post(`/api/orders/${order.id}/payment`, { headers: { origin }, data: {
    attemptKey: crypto.randomUUID(), method: "UPI", outcome: "success",
  } })).ok()).toBeTruthy();
  return order;
}

test("kitchen has readable tablet tickets and reports offline/recovery honestly", async ({ browser, page }) => {
  const customer = await browser.newContext({ baseURL: origin });
  try {
    await demo(customer.request, "customer");
    const order = await paidOrder(customer.request);
    await demo(page.request, "kitchen-kondapur");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/kitchen");
    await expect(page.locator(".connection-chip")).toHaveText("Live");
    await expect(page.getByText(/Last synced \d/)).toBeVisible();
    const ticket = page.locator(".kitchen-ticket").filter({ hasText: order.number });
    await expect(ticket).toBeVisible();
    for (const [selector, minimum] of [[".ticket-heading > strong", 30], [".ticket-timer", 26], [".ticket-items strong", 24], [".ticket-items small", 18], [".ticket-note", 20]] as const) {
      expect(await ticket.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(minimum);
    }
    await expect(page.getByRole("button", { name: "Enable sound" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep screen awake" })).toBeVisible();
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest.start_url).toBe("/kitchen");
    expect(manifest.display).toBe("standalone");
    mkdirSync(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/kitchen-tablet-quality.png", fullPage: true });
    await page.context().setOffline(true);
    await expect(page.locator(".connection-chip")).toHaveText("Offline");
    await expect(ticket.getByRole("button", { name: "Start preparing" })).toBeDisabled();
    await expect(ticket).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.locator(".connection-chip")).toHaveText("Live", { timeout: 15000 });
    await expect(ticket.getByRole("button", { name: "Start preparing" })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await ticket.locator(".ticket-heading > strong").evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(30);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { await customer.close(); }
});

test("kitchen sound is opt-in, chimes for a new paid order and wake lock releases on disable", async ({ browser, page }) => {
  const customer = await browser.newContext({ baseURL: origin });
  try {
    await page.addInitScript(() => {
      const state = { tones: 0, wakeRequests: 0, wakeReleases: 0 };
      Object.assign(window, { kitchenControlsTest: state });
      class FakeAudioContext {
        state = "suspended";
        currentTime = 0;
        destination = {};
        async resume() { this.state = "running"; }
        async suspend() { this.state = "suspended"; }
        async close() { this.state = "closed"; }
        createOscillator() { return { frequency: { value: 0 }, connect() {}, disconnect() {}, start() { state.tones++; }, stop() {} }; }
        createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      }
      Object.defineProperty(window, "AudioContext", { value: FakeAudioContext, configurable: true });
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { async request() {
        state.wakeRequests++;
        const sentinel = new EventTarget();
        return Object.assign(sentinel, { async release() { state.wakeReleases++; sentinel.dispatchEvent(new Event("release")); } });
      } } });
    });
    await demo(customer.request, "customer");
    await demo(page.request, "kitchen-kondapur");
    await page.goto("/kitchen");
    await expect(page.locator(".connection-chip")).toHaveText("Live");
    const controls = () => page.evaluate(() => (window as unknown as { kitchenControlsTest: { tones: number; wakeRequests: number; wakeReleases: number } }).kitchenControlsTest);
    expect((await controls()).tones).toBe(0);
    await page.getByRole("button", { name: "Enable sound" }).click();
    await expect(page.getByRole("button", { name: "Sound on" })).toHaveAttribute("aria-pressed", "true");
    expect((await controls()).tones).toBe(3);
    const order = await paidOrder(customer.request);
    await expect(page.locator(".kitchen-ticket").filter({ hasText: order.number })).toBeVisible();
    await expect.poll(async () => (await controls()).tones).toBe(6);
    await page.getByRole("button", { name: "Keep screen awake" }).click();
    await expect(page.getByRole("button", { name: "Screen awake" })).toBeVisible();
    expect((await controls()).wakeRequests).toBe(1);
    await page.getByRole("button", { name: "Screen awake" }).click();
    await expect.poll(async () => (await controls()).wakeReleases).toBe(1);
  } finally { await customer.close(); }
});

test("kitchen recovers a hung resource request and replaces a stalled event stream", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { kitchenReconnectTest: { connections: 0 } });
    class StallingEventSource extends EventTarget {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      closed = false;
      constructor() {
        super();
        (window as unknown as { kitchenReconnectTest: { connections: number } }).kitchenReconnectTest.connections++;
        // A single initial revision with no later heartbeat models a proxy that
        // leaves TCP open but stops forwarding events.
        setTimeout(() => { if (!this.closed) this.onmessage?.(new MessageEvent("message", { data: "{}" })); }, 50);
      }
      close() { this.closed = true; }
    }
    Object.defineProperty(window, "EventSource", { value: StallingEventSource, configurable: true });
  });
  let requests = 0;
  let releaseFirst: (() => void) | undefined;
  await page.route("**/api/staff/orders?**", async (route) => {
    requests++;
    if (requests === 1) {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      await route.abort().catch(() => {});
    } else await route.continue();
  });
  try {
    await demo(page.request, "kitchen-kondapur");
    await page.goto("/kitchen");
    await expect(page.locator(".connection-chip")).toHaveText("Live", { timeout: 20000 });
    expect(requests).toBeGreaterThan(1);
    await expect.poll(() => page.evaluate(() => (window as unknown as { kitchenReconnectTest: { connections: number } }).kitchenReconnectTest.connections), { timeout: 15000 }).toBeGreaterThan(1);
    await expect(page.getByText(/Last synced \d/)).toBeVisible();
  } finally { releaseFirst?.(); }
});
