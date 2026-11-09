import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

test("phone customers can navigate account settings and retry a failed sign-out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
  await page.goto("/orders");
  const profileLink = page.locator(".topbar").getByRole("link", { name: "Your profile", exact: true });
  await profileLink.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Mobile number", { exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "Edit profile", exact: true }).getByRole("button", { name: "Cancel", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Profile navigation", exact: true });
  await expect(navigation.getByRole("link", { name: "My orders", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Menu manager", exact: true })).toHaveCount(0);
  await navigation.getByRole("link", { name: "Privacy & account", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Your privacy settings", exact: true })).toBeVisible();
  await profileLink.click();
  await expect(page).toHaveURL(/\/profile$/);
  let attempts = 0;
  await page.route("**/api/auth/logout", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Sign-out temporarily unavailable" }) });
    return route.continue();
  });
  await navigation.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sign-out temporarily unavailable" })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user).not.toBeNull();
  await expect(navigation.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await navigation.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  expect(attempts).toBe(2);
});

test("tablet staff can read all account navigation and sign out from a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } })).ok()).toBeTruthy();
  await page.goto("/workspace");
  await page.locator(".topbar").getByRole("link", { name: "Your profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("button", { name: "View details", exact: true }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save details", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const account = page.getByRole("button", { name: "Workspace menu", exact: true });
  await account.click();
  const dialog = page.getByRole("dialog", { name: "Your account", exact: true });
  for (const name of ["Your profile", "Overview", "Kitchen display", "AI & automation", "Menu manager", "Services", "Party requests", "Customer menu", "Privacy & account", "Help & refunds"]) {
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(account).toBeFocused();
  await account.click();
  await dialog.getByRole("link", { name: "AI & automation", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/ai$/);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "AI & automation", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 640 });
  const triggerSize = await account.boundingBox();
  expect(triggerSize!.width).toBeGreaterThanOrEqual(44);
  expect(triggerSize!.height).toBeGreaterThanOrEqual(44);
  await account.click();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).scrollIntoViewIfNeeded();
  const dialogBounds = await dialog.boundingBox();
  expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(320);
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
});
