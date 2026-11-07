import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3001";

test("hosted payment loads after client navigation, verifies the callback and preserves safe retry", async ({ page }) => {
  const response = await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } });
  expect(response.ok()).toBeTruthy();
  const created = await page.request.post("/api/orders", { headers: { origin }, data: {
    checkoutKey: crypto.randomUUID(), outletId: "kondapur", fulfillment: "pickup", phone: "9000000000",
    lines: [{ itemId: "chicken-biryani", portion: "regular", quantity: 1, addOnIds: [] }],
  } });
  expect(created.ok()).toBeTruthy();
  const order = await created.json();
  let verified = false;
  // Every provider request is a fixture. Never load or call the real gateway.
  await page.route("https://**.razorpay.com/**", (route) => route.request().url().endsWith("checkout.js")
    ? route.fulfill({ contentType: "application/javascript", body: `window.Razorpay = class {
      constructor(options) { this.options = options; }
      on() {}
      open() { this.options.handler({razorpay_order_id:'order_browser',razorpay_payment_id:'pay_browser',razorpay_signature:'${"a".repeat(64)}'}); }
      close() {}
    };` }) : route.abort());
  await page.route(`**/api/orders/${order.id}/gateway`, route => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    provider: "razorpay", keyId: "rzp_test_browser_fixture", providerOrderId: "order_browser", amount: order.totalPaise,
    currency: "INR", name: "Deccan Kitchen", description: order.number,
  }) }));
  await page.route(`**/api/orders/${order.id}/gateway/verify`, async route => {
    const body = route.request().postDataJSON();
    expect(body.razorpay_order_id).toBe("order_browser");
    expect(body.razorpay_payment_id).toBe("pay_browser");
    verified = true;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Confirmation delayed" }) });
  });
  const first = await page.goto("/orders");
  expect(first?.headers()["content-security-policy"]).toContain("frame-src https://*.razorpay.com");
  await page.locator(`a[href='/payment/${order.id}']`).click();
  await expect(page.getByRole("heading", { name: "One last step." })).toBeVisible();
  await expect(page.getByText("Secure checkout with Razorpay", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Payment result")).toHaveCount(0);
  const pay = page.getByRole("button", { name: /Pay .*test mode/ });
  await expect(pay).toBeEnabled();
  await pay.click();
  await expect(page.getByRole("alert").filter({ hasText: "Confirmation delayed" })).toBeVisible();
  expect(verified).toBe(true);
  await expect(pay).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: ".local/screenshots/gateway-mobile.png", animations: "disabled" });
});
