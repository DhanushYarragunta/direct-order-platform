import { test, expect } from "@playwright/test";

test("password signup, privacy export, withdrawal and deletion revoke the account", async ({ page }) => {
  // Backslashes are normalized as slashes by browsers and must not escape the app.
  await page.goto(`/login?next=${encodeURIComponent("/\\untrusted.example")}`);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Privacy browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(`privacy-${crypto.randomUUID()}@customer.test`);
  await page.getByLabel("Password", { exact: true }).fill("privacy-browser-password!");
  await page.getByRole("checkbox", { name: /I agree to the use of my details/ }).check();
  await page.getByRole("checkbox", { name: /Send me offers and kitchen news/ }).check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const response = await page.goto("/privacy");
  expect(response!.headers()["content-security-policy"]).toContain("'strict-dynamic'");
  expect(response!.headers()["content-security-policy"].split(";").find((v) => v.includes("script-src"))).not.toContain("unsafe-inline");
  await expect(page.getByRole("checkbox", { name: /Send me offers and kitchen news/ })).toBeChecked();
  await page.route("**/api/account", (route) => route.request().method() === "PATCH"
    ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Preference update unavailable" }) })
    : route.continue());
  await page.getByRole("checkbox", { name: /Send me offers and kitchen news/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Preference update unavailable" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Send me offers and kitchen news/ })).toBeChecked();
  await page.unroute("**/api/account");
  await page.getByRole("checkbox", { name: /Send me offers and kitchen news/ }).uncheck();
  await expect(page.getByRole("status").filter({ hasText: "Marketing consent withdrawn" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my account data" }).click();
  expect((await download).suggestedFilename()).toBe("deccan-account-data.json");
  await page.getByText("Delete my customer account", { exact: true }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted" })).toBeVisible();
  const me = await page.request.get("/api/auth/me");
  expect((await me.json()).user).toBeNull();
  expect((await page.request.get("/api/account/export")).status()).toBe(401);
});

test("database readiness is public and does not expose configuration", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "reachable" });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
