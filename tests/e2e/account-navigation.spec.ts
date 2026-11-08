import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:3001";

test("phone customers can navigate account settings and retry a failed sign-out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
  await page.goto("/orders");
  const account = page.getByRole("button", { name: "Your account", exact: true });
  await account.click();
  const dialog = page.getByRole("dialog", { name: "Your account", exact: true });
  await expect(dialog.getByRole("link", { name: "My orders", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(dialog.getByRole("link", { name: "Menu manager", exact: true })).toHaveCount(0);
  await dialog.getByRole("link", { name: "Privacy & account", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Your privacy settings", exact: true })).toBeVisible();
  await account.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(account).toBeFocused();
  let attempts = 0;
  await page.route("**/api/auth/logout", async (route) => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Sign-out temporarily unavailable" }) });
    return route.continue();
  });
  await account.click();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Sign-out temporarily unavailable");
  expect((await (await page.request.get("/api/auth/me")).json()).user).not.toBeNull();
  await expect(dialog.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  expect(attempts).toBe(2);
});

test("tablet staff can read all account navigation and sign out from a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } })).ok()).toBeTruthy();
  await page.goto("/workspace");
  const account = page.getByRole("button", { name: "Your account", exact: true });
  await account.click();
  const dialog = page.getByRole("dialog", { name: "Your account", exact: true });
  for (const name of ["Overview", "Kitchen display", "AI & automation", "Menu manager", "Services", "Party requests", "Customer menu", "Privacy & account", "Help & refunds"]) {
    await expect(dialog.getByRole("link", { name, exact: true })).toBeVisible();
  }
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
