import { test, expect } from "@playwright/test";

test("privacy preferences recover from an initial account load failure", async ({ page }) => {
  const login = await page.request.post("/api/auth/demo", {
    headers: { origin: "http://127.0.0.1:3001" }, data: { account: "customer" },
  });
  expect(login.ok()).toBeTruthy();
  let attempts = 0;
  await page.route("**/api/account", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    attempts += 1;
    if (attempts === 1) return route.fulfill({
      status: 503, contentType: "application/json", body: JSON.stringify({ error: "Preferences temporarily unavailable" }),
    });
    return route.continue();
  });
  await page.goto("/privacy");
  const settings = page.getByRole("region", { name: "Your privacy settings" });
  await expect(settings.getByRole("alert")).toContainText("Preferences temporarily unavailable");
  await expect(settings.getByText("Loading preferences…", { exact: true })).toHaveCount(0);
  await expect(settings).toHaveAttribute("aria-busy", "false");
  await expect(settings.getByRole("checkbox", { name: /Send me offers and kitchen news/ })).toHaveCount(0);
  await settings.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(settings.getByRole("checkbox", { name: /Send me offers and kitchen news/ })).toBeEnabled();
  await expect(settings.getByRole("button", { name: "Download my account data" })).toBeEnabled();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});

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

test("successful account deletion stays confirmed when the sign-in refresh fails", async ({ page }) => {
  const registration = await page.request.post("/api/auth/register", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: {
      name: "Deleted privacy customer", email: `deleted-${crypto.randomUUID()}@customer.test`,
      password: "privacy-deletion-password!", consent: true, marketingOptIn: false,
    },
  });
  expect(registration.ok()).toBeTruthy();
  await page.goto("/privacy");
  const settings = page.getByRole("region", { name: "Your privacy settings" });
  await expect(settings.getByRole("button", { name: "Download my account data" })).toBeEnabled();
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "Sign-in refresh unavailable" }),
  }));
  await settings.getByText("Delete my customer account", { exact: true }).click();
  await settings.getByLabel("Type DELETE to confirm").fill("DELETE");
  await settings.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(settings.getByRole("status")).toContainText("Your account has been deleted");
  await expect(settings.getByRole("alert")).toContainText("the sign-in display could not refresh");
  await expect(settings).toHaveAttribute("aria-busy", "false");
  await expect(settings.getByText("Signed in as", { exact: false })).toHaveCount(0);
  await expect(settings.getByRole("checkbox")).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Download my account data" })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Permanently delete my account" })).toHaveCount(0);
  expect((await page.request.get("/api/account/export")).status()).toBe(401);
  await page.unroute("**/api/auth/me");
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
});

test("database readiness is public and does not expose configuration", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", database: "reachable" });
  expect(response.headers()["cache-control"]).toBe("no-store");
});
