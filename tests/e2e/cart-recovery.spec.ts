import { test, expect } from "@playwright/test";
import { CART_CONSUME_LOCK } from "../../src/lib/cart-checkout";

const origin = "http://127.0.0.1:3001";

test("a delayed payment consumes only ordered quantities once, including after reload", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page).toHaveURL(/\/payment\//);
  const paymentUrl = page.url();
  const id = new URL(paymentUrl).pathname.split("/").pop()!;
  await page.reload();
  await page.getByLabel("Payment result").selectOption("pending");
  await page.getByRole("button", { name: /Pay ₹/ }).click();
  await expect(page.getByText("Payment is processing.", { exact: false })).toBeVisible();
  await page.goto("/");
  const chicken = page.locator(".cart-line").filter({ hasText: "Chicken dum biryani" });
  await chicken.getByRole("button", { name: "Add one Chicken dum biryani" }).click();
  await chicken.getByRole("button", { name: "Add one Chicken dum biryani" }).click();
  await page.getByRole("button", { name: "Add Double ka meetha", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await expect.poll(async () => {
    const order = await (await page.request.get(`/api/orders/${id}`)).json();
    return order.paymentStatus;
  }, { timeout: 20000 }).toBe("PAID");
  await page.goto(paymentUrl);
  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  await page.goto("/");
  await expect(chicken.locator(".stepper > span")).toHaveText("2");
  await expect(page.locator(".cart-line").filter({ hasText: "Double ka meetha" })).toBeVisible();

  // Returning to an already processed payment must not consume the new cart again.
  await page.goto(paymentUrl);
  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  await page.goto("/");
  await expect(chicken.locator(".stepper > span")).toHaveText("2");
  await expect(page.locator(".cart-line")).toHaveCount(2);
});

test("checkout displays a recoverable menu failure without losing the saved cart", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.route("**/api/menu?*", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Menu temporarily unavailable" }),
  }));
  // Exercise manual recovery without an SSE refresh recovering before the click.
  await page.route("**/api/events?*", (route) => route.abort());
  await page.goto("/checkout");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Menu temporarily unavailable");
  await page.unroute("**/api/menu?*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Mobile number")).toBeVisible();
  await expect(page.locator(".cart-line")).toContainText("Chicken dum biryani");
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeEnabled();
});

test("paying an earlier checkout preserves an identical dish removed and added again", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page).toHaveURL(/\/payment\//);
  const paymentUrl = page.url();
  const id = new URL(paymentUrl).pathname.split("/").pop()!;

  await page.goto("/");
  await page.getByRole("button", { name: "Remove Chicken dum biryani", exact: true }).click();
  await expect(page.locator(".cart-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.reload();
  await expect(page.locator(".cart-line")).toHaveCount(1);

  const paid = await page.request.post(`/api/orders/${id}/payment`, {
    headers: { origin }, data: { attemptKey: crypto.randomUUID(), method: "UPI", outcome: "success" },
  });
  expect(paid.ok()).toBeTruthy();
  await page.goto(paymentUrl);
  await expect(page).toHaveURL(new RegExp(`/orders/${id}$`));
  await page.goto("/");
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await expect(page.locator(".cart-line .stepper > span")).toHaveText("1");
});

test("two payment tabs consume once while browsers without Web Locks preserve the cart", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect(login.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page).toHaveURL(/\/payment\//);
  const paymentUrl = page.url();
  const id = new URL(paymentUrl).pathname.split("/").pop()!;
  await page.goto("/");
  await page.getByRole("button", { name: "Add one Chicken dum biryani", exact: true }).click();
  await page.getByRole("button", { name: "Add one Chicken dum biryani", exact: true }).click();
  const quantity = page.locator(".cart-line .stepper > span");
  await expect(quantity).toHaveText("3");
  const paid = await page.request.post(`/api/orders/${id}/payment`, {
    headers: { origin }, data: { attemptKey: crypto.randomUUID(), method: "UPI", outcome: "success" },
  });
  expect(paid.ok()).toBeTruthy();

  const fallback = await page.context().newPage();
  await fallback.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  await fallback.goto(paymentUrl);
  await expect(fallback).toHaveURL(new RegExp(`/orders/${id}$`));
  await expect(fallback.getByRole("status").filter({ hasText: "Please review your saved cart" })).toBeVisible();
  await fallback.close();
  await expect(quantity).toHaveText("3");

  // Hold the shared lock until both paid pages are queued, making the overlap deterministic.
  await page.evaluate(async (lockName) => {
    const state = window as unknown as { releaseCartPaymentLock: () => void };
    let acquired!: () => void;
    const ready = new Promise<void>((resolve) => { acquired = resolve; });
    const held = new Promise<void>((resolve) => { state.releaseCartPaymentLock = resolve; });
    void navigator.locks.request(lockName, async () => { acquired(); await held; });
    await ready;
  }, CART_CONSUME_LOCK);
  const first = await page.context().newPage();
  const second = await page.context().newPage();
  try {
    await Promise.all([first.goto(paymentUrl), second.goto(paymentUrl)]);
    await expect.poll(() => page.evaluate(async (lockName) => {
      const locks = await navigator.locks.query();
      return locks.pending?.filter((lock) => lock.name === lockName).length;
    }, CART_CONSUME_LOCK)).toBe(2);
    await expect(quantity).toHaveText("3");
    await page.evaluate(() => (window as unknown as { releaseCartPaymentLock: () => void }).releaseCartPaymentLock());
    await expect(first).toHaveURL(new RegExp(`/orders/${id}$`));
    await expect(second).toHaveURL(new RegExp(`/orders/${id}$`));
    await expect(quantity).toHaveText("2");
    await page.reload();
    await expect(quantity).toHaveText("2");
  } finally {
    await page.evaluate(() => (window as unknown as { releaseCartPaymentLock?: () => void }).releaseCartPaymentLock?.()).catch(() => {});
    await first.close();
    await second.close();
  }
});
