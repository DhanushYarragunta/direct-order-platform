import { test, expect, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:3001";
const place = { id: "kukatpally-test", name: "Kukatpally", address: "Kukatpally, Hyderabad", city: "Hyderabad", pincode: "500072",
  latitude: 17.4948, longitude: 78.3996, localityId: "kukatpally", kind: "area" };
const address = { label: "Home", recipientName: "Profile Customer", phone: "9876102345", addressLine: "Flat 302, Test Apartments",
  area: place.address, city: place.city, pincode: place.pincode, latitude: place.latitude, longitude: place.longitude,
  localityId: "kukatpally", locationKind: "area", isDefault: true };
async function register(page: Page) {
  const result = await page.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Profile Customer", email: `profile-${crypto.randomUUID()}@example.test`, password: "profile-test-password", consent: true,
  } });
  expect(result.status()).toBe(201);
}
async function fixture(page: Page) {
  await page.route("**/api/locations/search?*", route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ provider: "photon", attribution: "OpenStreetMap contributors", results: [place] }) }));
}
async function addAddressThroughUi(page: Page) {
  await page.getByRole("button", { name: "Add address", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a delivery address" });
  await dialog.getByRole("combobox", { name: "Search delivery location" }).fill("Kukatpally");
  await dialog.getByRole("option", { name: /Kukatpally/ }).click();
  await dialog.getByLabel("Flat / house, building and street").fill(address.addressLine);
  await dialog.getByLabel("Recipient mobile number").fill(address.phone);
  await dialog.getByRole("checkbox", { name: /My address is in this area/ }).check();
  await dialog.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test("mobile profile saves contact and default address, then fills checkout after a reload", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page); await fixture(page);
  await page.goto("/");
  await page.locator(".topbar").getByRole("link", { name: "Your profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Edit profile", exact: true });
  await page.getByLabel("Full name").fill("My Profile");
  await page.getByLabel("Mobile number", { exact: true }).fill("+91 98761 02345");
  await page.screenshot({ path: ".local/screenshots/profile-details-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(details).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Your details are saved" })).toBeVisible();
  await addAddressThroughUi(page);
  await expect(page.getByRole("article", { name: "Home address" })).toContainText("Default");
  await page.reload();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Full name")).toHaveValue("My Profile");
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue(address.phone);
  await details.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".topbar").getByRole("button", { name: "Change delivery location" })).toContainText("Home");
  await page.screenshot({ path: ".local/screenshots/profile-mobile.png", fullPage: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue(address.phone);
  await expect(page.getByLabel("Delivery address", { exact: true })).toHaveValue(/Flat 302, Test Apartments, Kukatpally, Hyderabad/);
  await expect(page.locator(".pickup-address")).toContainText("Kukatpally");
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: /My delivery address/ })).toHaveCount(0);
  await page.getByLabel("Mobile number", { exact: true }).fill("9876501234");
  expect((await (await page.request.get("/api/account/profile")).json()).phone).toBe(address.phone);
  await page.screenshot({ path: ".local/screenshots/saved-address-checkout-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("saved addresses can be edited, made default and removed without losing the survivor", async ({ page }) => {
  await register(page);
  expect((await page.request.post("/api/account/addresses", { headers: { origin }, data: address })).status()).toBe(201);
  expect((await page.request.post("/api/account/addresses", { headers: { origin }, data: { ...address, label: "Work", isDefault: false, addressLine: "Office 42, Test Towers" } })).status()).toBe(201);
  await page.goto("/profile");
  const home = page.getByRole("article", { name: "Home address" }), work = page.getByRole("article", { name: "Work address" });
  await work.getByRole("button", { name: "Set as default" }).click();
  await expect(work).toContainText("Default"); await expect(home.getByText("Default", { exact: true })).toHaveCount(0);
  await work.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit delivery address" });
  await dialog.getByLabel("Flat / house, building and street").fill("Office 43, Updated Towers");
  await dialog.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(dialog).not.toBeVisible(); await expect(work).toContainText("Office 43");
  await page.screenshot({ path: ".local/screenshots/profile-desktop.png", fullPage: true });
  await work.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("dialog", { name: "Remove this address?" }).getByRole("button", { name: "Remove address", exact: true }).click();
  await expect(work).toHaveCount(0); await expect(home).toContainText("Default");
  await page.reload(); await expect(home).toContainText("Default");
  const saved = await (await page.request.get("/api/account/addresses")).json();
  expect(saved.addresses).toHaveLength(1); expect(saved.addresses[0]).toMatchObject({ label: "Home", isDefault: true, locationKind: "area" });
});

test("a saved address is adopted even when the follow-up profile refresh fails", async ({ page }) => {
  await register(page); await fixture(page); await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Edit profile", exact: true })).toBeVisible();
  await page.route("**/api/account/profile*", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Refresh temporarily unavailable" }) }));
  await addAddressThroughUi(page);
  await expect(page.getByRole("article", { name: "Home address" })).toContainText(address.addressLine);
  await expect(page.locator(".topbar").getByRole("button", { name: "Change delivery location" })).toContainText("Home");
  await expect(page.getByRole("alert").filter({ hasText: "saved changes are safe" })).toBeVisible();
  await page.unroute("**/api/account/profile*");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "saved changes are safe" })).toHaveCount(0);
});

test("switching saved addresses refills the recipient and waits for a fresh checkout quote", async ({ page }) => {
  await register(page);
  expect((await page.request.post("/api/account/addresses", { headers: { origin }, data: address })).status()).toBe(201);
  expect((await page.request.post("/api/account/addresses", { headers: { origin }, data: {
    ...address, label: "Work", isDefault: false, phone: "9876501234", addressLine: "Office 42, Test Towers",
  } })).status()).toBe(201);
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeEnabled();
  let release!: () => void;
  const pendingQuote = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/checkout/quote", async route => { await pendingQuote; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Change delivery address", exact: true }).click();
    await page.getByRole("dialog", { name: "Where should we deliver?" }).getByRole("button", { name: /^Work/ }).click();
    await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("9876501234");
    await expect(page.getByLabel("Delivery address", { exact: true })).toHaveValue(/Office 42, Test Towers/);
    await expect(page.getByRole("button", { name: "Checking your total…" })).toBeDisabled();
  } finally { release(); }
  await expect(page.getByRole("button", { name: /Continue to payment/ })).toBeEnabled();
  // Choosing a different address for one order does not change the account's default.
  const saved = await (await page.request.get("/api/account/addresses")).json();
  expect(saved.addresses.find((item: { isDefault: boolean }) => item.isDefault).label).toBe("Home");
});

test("another account never inherits the previous customer's phone or delivery address", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await register(page);
  await page.request.post("/api/account/addresses", { headers: { origin }, data: address });
  await page.goto("/profile");
  await expect(page.getByRole("article", { name: "Home address" })).toBeVisible();
  await page.locator(".profile-nav").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.locator(".topbar").getByRole("button", { name: "Change delivery location" })).toContainText("Choose your location");
  await register(page); await page.goto("/profile");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Mobile number", { exact: true })).toHaveValue("");
  await page.getByRole("dialog", { name: "Edit profile", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "A home for your next delivery" })).toBeVisible();
  await expect(page.getByText(address.addressLine, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: ".local/screenshots/profile-small-mobile.png", fullPage: true });
});
