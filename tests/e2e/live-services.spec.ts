import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const origin = "http://127.0.0.1:3001";
test("normal sign-in uses a password and offers account recovery separately", async ({ page }) => {
  const email = `browser-${crypto.randomUUID()}@example.test`, password = "password-browser-secret!";
  expect((await page.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Password browser customer", email, password, consent: true,
  } })).status()).toBe(201);
  await page.request.post("/api/auth/logout", { headers: { origin } });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /^Email code|^Phone code/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Forgot password?", exact: true })).toBeVisible();
  await page.getByLabel("Email or mobile number", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/");
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy & account", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: ".local/screenshots/account-verification-mobile.png", animations: "disabled" });
  await page.getByRole("heading", { name: "Verified contacts for order updates" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local/screenshots/account-contacts-mobile.png", animations: "disabled" });
});

test("a paid order downloads a private PDF and prevents other customers reading it", async ({ page, browser }) => {
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
  const created = await page.request.post("/api/orders", { headers: { origin }, data: {
    checkoutKey: crypto.randomUUID(), outletId: "kondapur", fulfillment: "pickup", phone: "9000000000",
    lines: [{ itemId: "chicken-biryani", portion: "regular", quantity: 1, addOnIds: [] }],
  } });
  expect(created.ok()).toBeTruthy();
  const order = await created.json();
  expect((await page.request.get(`/api/orders/${order.id}/receipt`)).status()).toBe(409);
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { headers: { origin }, data: {
    attemptKey: crypto.randomUUID(), method: "UPI", outcome: "success",
  } })).ok()).toBeTruthy();
  await page.goto(`/orders/${order.id}`);
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toMatch(/^receipt-WEB-.*\.pdf$/);
  const file = await download.path();
  expect(file).toBeTruthy();
  expect((await readFile(file!)).subarray(0, 5).toString()).toBe("%PDF-");
  const receipt = await page.request.get(`/api/orders/${order.id}/receipt`);
  expect(receipt.headers()["content-type"]).toContain("application/pdf");
  expect(receipt.headers()["cache-control"]).toContain("no-store");
  const outsider = await browser.newContext({ baseURL: origin });
  expect((await outsider.request.get(`/api/orders/${order.id}/receipt`)).status()).toBe(401);
  expect((await outsider.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Other customer", email: `outside-${crypto.randomUUID()}@example.test`, password: "Strong-unique-234!", consent: true,
  } })).ok()).toBeTruthy();
  expect((await outsider.request.get(`/api/orders/${order.id}/receipt`)).status()).toBe(404);
  await outsider.close();
});

test("service diagnostics are administrator-only and display no credentials", async ({ page }) => {
  expect((await page.request.get("/api/admin/services")).status()).toBe(401);
  await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect((await page.request.get("/api/admin/services")).status()).toBe(403);
  await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } });
  const response = await page.request.get("/api/admin/services");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.payment.provider).toBe("demo");
  expect(data.workers.map((worker: { job: string }) => worker.job)).toEqual(["orders", "payments", "notifications"]);
  expect(JSON.stringify(data)).not.toMatch(/KEY_SECRET|AUTH_TOKEN|DATABASE_URL|SECRET_ACCESS_KEY/);
  await page.goto("/workspace/services");
  await expect(page.getByRole("heading", { name: "Payments & communications", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Background processing", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment reconciliation", exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/screenshots/services-desktop.png", fullPage: true });
});

test("service diagnostics explain stalled work and overdue recovery on mobile", async ({ page }) => {
  await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } });
  const data = await (await page.request.get("/api/admin/services")).json();
  const now = new Date().toISOString(), earlier = new Date(Date.now() - 20 * 60_000).toISOString();
  data.checkedAt = now;
  data.workers = data.workers.map((worker: { job: string }) => ({ ...worker,
    status: worker.job === "payments" ? "stalled" : "healthy", lastReportedAt: now, lastStartedAt: earlier,
    lastSucceededAt: earlier, consecutiveFailures: 0, instances: [],
  }));
  data.queues = { ...data.queues, paymentRecovery: 1, queuedNotifications: 1 };
  data.queueTiming = { oldestNotificationAt: earlier, paymentOverdueSince: earlier, refundOverdueSince: null };
  data.recoveryIssues = [{ id: "browser-recovery", providerOrderId: "order_browser_fixture", testMode: true,
    lastError: "Payment reconciliation needs retry or operator review", nextCheckAt: earlier, updatedAt: earlier,
    order: { id: "browser-order", number: "WEB-RECOVERY-TEST", status: "PENDING_PAYMENT" },
  }];
  data.queues.webhookAttention = 1;
  data.webhookIssues = [{ id: "browser-webhook", event: "payment.captured", status: "FAILED", paymentId: "pay_browser_recovery",
    refundId: null, refundPaymentId: null, testMode: true, attempts: 8, lastErrorCode: "RETRY_LIMIT_REACHED", receivedAt: earlier }];
  await page.route("**/api/admin/services", route => route.fulfill({ json: data }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/workspace/services");
  const workers = page.getByRole("region", { name: "Background processing" });
  await expect(workers.getByText("Taking too long", { exact: true })).toBeVisible();
  await expect(workers.getByText(/A run exceeded 15 minutes/)).toBeVisible();
  await expect(page.getByText("Oldest check overdue by 20 min", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "WEB-RECOVERY-TEST", exact: true })).toHaveAttribute("href", "/orders/browser-order");
  await expect(page.getByText("Test payment · Provider order: order_browser_fixture", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment updates to review", exact: true })).toBeVisible();
  await expect(page.getByText("Automatic retries exhausted", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await workers.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local/screenshots/services-worker-mobile.png", animations: "disabled" });
});
