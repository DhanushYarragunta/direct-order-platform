import { test, expect, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:3001";
async function register(page: Page) {
  expect((await page.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Completion Customer", email: `completion-${crypto.randomUUID()}@example.test`, password: "completion-test-password", consent: true,
  } })).status()).toBe(201);
}
async function demo(page: Page, account: string) {
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account } })).ok()).toBeTruthy();
}

test("favourites persist between menu and profile without adding to the cart", async ({ page }) => {
  await register(page); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Save Chicken dum biryani to favourites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Chicken dum biryani from favourites", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cart-line")).toHaveCount(0);
  await page.goto("/profile");
  await page.locator(".profile-link-group").getByRole("link", { name: /Favourites/ }).click();
  await expect(page.locator(".dish-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".dish-card")).toHaveCount(1);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: ".local/screenshots/favourites-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole("button", { name: "Remove Chicken dum biryani from favourites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Save a dish you love" })).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(0);
});

test("past-order review preserves the cart until confirmation and merges portions and extras", async ({ page }) => {
  await register(page);
  const response = await page.request.post("/api/orders", { headers: { origin }, data: {
    checkoutKey: crypto.randomUUID(), outletId: "kondapur", fulfillment: "pickup", phone: "9000000000",
    lines: [{ itemId: "chicken-biryani", portion: "family", quantity: 1, addOnIds: ["raita"] }],
  } });
  expect(response.ok()).toBeTruthy();
  const order = await response.json();
  expect((await page.request.post(`/api/orders/${order.id}/payment`, { headers: { origin }, data: { attemptKey: crypto.randomUUID(), method: "UPI", outcome: "success" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  const cartBefore = await page.evaluate(() => localStorage.getItem("deccan-cart-v1"));
  await page.goto("/orders");
  await page.locator(".order-history-entry").filter({ hasText: order.number }).getByRole("button", { name: "Order again" }).click();
  await expect(page.getByRole("dialog")).toContainText("Family pack");
  await expect(page.getByRole("dialog")).toContainText(/raita/i);
  expect(await page.evaluate(() => localStorage.getItem("deccan-cart-v1"))).toBe(cartBefore);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: ".local/screenshots/reorder-review.png", fullPage: true });
  await page.getByRole("button", { name: "Add selected dishes to cart" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.locator(".cart-line")).toHaveCount(2);
  await expect(page.locator(".cart-line").filter({ hasText: /family/i })).toContainText(/raita/i);
});

test("party bookings reuse saved details and allow a searched venue", async ({ page }) => {
  await register(page);
  expect((await page.request.post("/api/account/addresses", { headers: { origin }, data: {
    label: "Home", recipientName: "Party Recipient", phone: "9876504321", addressLine: "Flat 12, Sample Apartments", area: "Kondapur", city: "Hyderabad", pincode: "500084",
    latitude: 17.462, longitude: 78.357, locationKind: "place", isDefault: true,
  } })).status()).toBe(201);
  await page.route("**/api/locations/search?*", route => route.fulfill({ json: { provider: "photon", attribution: "OpenStreetMap contributors", results: [
    { id: "venue", name: "Garden Hall", address: "Garden Hall, Kondapur, Hyderabad", city: "Hyderabad", pincode: "500084", latitude: 17.462, longitude: 78.357, kind: "place" },
  ] } }));
  await page.goto("/catering");
  await expect(page.getByLabel("Contact name", { exact: true })).toHaveValue("Party Recipient");
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("9876504321");
  await expect(page.getByRole("textbox", { name: "Event address", exact: true })).toHaveValue(/Flat 12/);
  await page.getByLabel("Use a saved address").selectOption("");
  await page.getByRole("combobox", { name: "Search event location" }).fill("Garden");
  await page.getByRole("option", { name: /Garden Hall/ }).click();
  await expect(page.getByRole("textbox", { name: "Event address", exact: true })).toHaveValue("Garden Hall, Kondapur, Hyderabad");
  await page.getByLabel("Occasion", { exact: true }).fill("Family gathering");
  await page.getByLabel("Menu and dietary requirements").fill("Twenty vegetarian meals with raita on the side.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: ".local/screenshots/catering-saved-details-mobile.png", fullPage: true });
  const pending = page.waitForResponse(response => response.url().endsWith("/api/catering") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send party request", exact: true }).click();
  const sent = await pending;
  expect(sent.status()).toBe(201);
  expect(await sent.json()).toMatchObject({ contactName: "Party Recipient", phone: "9876504321", address: "Garden Hall, Kondapur, Hyderabad" });
});

test("admin creates and pauses a coupon that customers can use at checkout", async ({ page, browser }) => {
  await demo(page, "admin");
  await page.goto("/workspace/coupons");
  const code = `BROWSER${Date.now()}`;
  await page.getByRole("button", { name: "Create coupon" }).click();
  await page.getByLabel("Coupon code", { exact: true }).fill(code);
  await page.getByLabel("Offer description").fill("Ten percent for browser verification");
  await page.getByLabel("Minimum item total (₹)").fill("100");
  await page.getByRole("button", { name: "Save coupon", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const customer = await browser.newContext({ baseURL: origin });
  try {
    const client = await customer.newPage(); await register(client);
    const quote = { outletId: "kondapur", fulfillment: "pickup", couponCode: code, lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular", addOnIds: [] }] };
    const result = await customer.request.post("/api/checkout/quote", { headers: { origin }, data: quote });
    expect(result.status()).toBe(200); expect((await result.json()).couponDiscountPaise).toBe(3200);
    await page.getByRole("button", { name: `Edit ${code}`, exact: true }).click();
    await page.getByLabel("Enabled during the selected dates").uncheck();
    await page.getByRole("button", { name: "Save coupon", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".coupon-card").filter({ hasText: code })).toContainText("Paused");
    expect((await customer.request.post("/api/checkout/quote", { headers: { origin }, data: quote })).status()).toBe(409);
    await page.getByLabel("Search coupons").fill(code);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: ".local/screenshots/coupons-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  } finally { await customer.close(); }
});

test("kitchen filters keep hidden-ticket warnings and stock search clear", async ({ page }) => {
  await demo(page, "kitchen-kondapur"); await page.goto("/kitchen");
  await expect(page.locator(".kitchen-ticket").first()).toBeVisible();
  const count = await page.locator(".kitchen-ticket").count();
  await page.getByLabel("Find a kitchen ticket").fill("no-such-order");
  await expect(page.locator(".kitchen-ticket")).toHaveCount(0);
  await expect(page.locator(".kitchen-filter-note")).toContainText("Filtered view");
  await page.getByRole("button", { name: "Show all tickets" }).click();
  await expect(page.locator(".kitchen-ticket")).toHaveCount(count);
  await page.getByRole("button", { name: "Availability", exact: true }).click();
  await page.getByLabel("Search kitchen availability").fill("Chicken dum biryani");
  await expect(page.locator(".stock-row")).toHaveCount(1);
  await expect(page.locator(".stock-row")).toContainText("Chicken dum biryani");
});
