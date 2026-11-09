import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = "http://127.0.0.1:3001";

test("mobile delivery chooses Kukatpally without GPS and shows wait, fee and completion", async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/locations/search?*", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    provider: "photon", attribution: "OpenStreetMap test fixture", results: [{ id: "test-kukatpally", name: "Kukatpally",
      address: "Kukatpally, Hyderabad", city: "Hyderabad", pincode: "500072", latitude: 17.4948, longitude: 78.3996,
      kind: "area" }],
  }) }));
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByRole("button", { name: "Delivery To your doorstep", exact: true }).click();
  await page.locator(".checkout-location-action").click();
  const location = page.getByRole("dialog", { name: "Where should we deliver?", exact: true });
  await location.getByRole("combobox", { name: "Search delivery location", exact: true }).fill("Kukatpally");
  await location.getByRole("option").filter({ hasText: "Kukatpally" }).click();
  await location.getByRole("button", { name: "Use this location", exact: true }).click();
  await expect(location).not.toBeVisible();
  await page.getByRole("textbox", { name: "Delivery address", exact: true }).fill("Test flat, Kukatpally centre");
  await expect(page.getByLabel("Mobile number")).toHaveValue("9000000000");
  await expect(page.getByRole("textbox", { name: "Delivery address", exact: true })).toHaveValue("Test flat, Kukatpally centre");
  await page.getByRole("checkbox", { name: /My delivery address is in this area/ }).check();
  await expect(page.locator(".pickup-address").getByText("Kukatpally", { exact: true })).toBeVisible();
  await expect(page.locator(".pickup-address").getByText(/Estimated preparation: \d+ min/)).toBeVisible();
  await expect(page.locator(".cart-summary").getByText("₹40", { exact: true })).toBeVisible();
  mkdirSync(".local/screenshots", { recursive: true });
  await page.screenshot({ path: ".local/screenshots/delivery-checkout-mobile.png", fullPage: true });
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(page.getByText(/Estimated preparation: \d+ min/)).toBeVisible();
  await page.getByRole("button", { name: /Pay ₹/ }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const order = await (await page.request.get(`/api/orders/${id}`)).json();
  expect(order.outletId).toBe("kukatpally");
  expect(order.deliveryLocalityId).toBeNull();
  expect(order.address).toContain("Test flat, Kukatpally centre");
  expect(order.address).toContain("Kukatpally, Hyderabad");
  expect(order.address).toContain("500072");
  expect(order.deliveryFeePaise).toBe(4000);
  expect(order.checkoutDurationMs).toBeGreaterThan(0);
  expect(order.checkoutMetricSource).toBe("demo");
  const kitchen = await browser.newContext({ baseURL: origin });
  try {
    expect((await kitchen.request.post("/api/auth/demo", { headers: { origin }, data: { account: "kitchen-kukatpally" } })).ok()).toBeTruthy();
    let version = order.version;
    for (const status of ["PREPARING", "READY", "HANDED_OFF", "OUT_FOR_DELIVERY", "DELIVERED"]) {
      const response = await kitchen.request.patch(`/api/orders/${id}`, { headers: { origin }, data: { status, version } });
      expect(response.ok()).toBeTruthy();
      version = (await response.json()).version;
    }
    await expect(page.locator(".order-detail-heading").getByText("Delivered", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Enjoy every bite." })).toBeVisible();
  } finally { await kitchen.close(); }
});

test("checkout GPS automatically moves a Kondapur cart to the nearest eligible outlet", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 17.494, longitude: 78.399 });
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Delivery To your doorstep", exact: true }).click();
  await page.locator(".checkout-location-action").click();
  const location = page.getByRole("dialog", { name: "Where should we deliver?", exact: true });
  await location.getByRole("button", { name: "Use current location", exact: false }).click();
  await location.getByRole("button", { name: "Use this location", exact: true }).click();
  await expect(location).not.toBeVisible();
  await page.getByLabel("Mobile number").fill("9000000000");
  await page.getByRole("textbox", { name: "Delivery address", exact: true }).fill("GPS test flat, Kukatpally");
  await expect(page.locator(".pickup-address").getByText("Kukatpally", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeEnabled();
});
