import { test, expect, type Page } from "@playwright/test";

const origin = "http://127.0.0.1:3001";
const cookieName = "company_a_session";
const password = "auth-entry-test-password";
const menuHeading = "Something delicious awaits.";

async function registerCustomer(page: Page) {
  const email = `auth-entry-${crypto.randomUUID()}@example.test`;
  const response = await page.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Entry Customer", email, password, consent: true,
  } });
  expect(response.status()).toBe(201);
  return email;
}
async function expectLogin(page: Page) {
  await expect(page).toHaveURL(url => url.pathname === "/login" && url.searchParams.get("next") === "/");
  await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();
  await expect(page.locator(".menu-page")).toHaveCount(0);
}

test("a fresh visitor sees login before the menu, even without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ baseURL: origin, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const response = await page.request.get("/", { maxRedirects: 0 });
    // Streaming may use a redirect document instead of HTTP 307. Neither response
    // may contain the menu while the visitor has no authenticated session.
    expect([200, 307]).toContain(response.status());
    expect(await response.text()).not.toContain('class="page menu-page"');
    await page.goto("/");
    await expectLogin(page);
  } finally { await context.close(); }
});

test("password login returns to the menu and a valid session survives reload", async ({ page }) => {
  const email = await registerCustomer(page);
  expect((await page.request.post("/api/auth/logout", { headers: { origin }, data: {} })).ok()).toBeTruthy();
  await page.goto("/");
  await expectLogin(page);
  // Exercise a client navigation to the signed-out root before logging in. A
  // previously loaded/prefetched redirect must not strand the next session.
  // The final URL is the same as the initial URL. Wait for the actual redirect
  // navigation, otherwise filling can target the form it is about to replace.
  const redirected = page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() && new URL(frame.url()).pathname === "/login" });
  await page.getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Our menu", exact: true }).click();
  await redirected;
  await expectLogin(page);
  await page.getByLabel("Email or mobile number", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("heading", { name: menuHeading, exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(`${origin}/`);
  await expect(page.getByRole("heading", { name: menuHeading, exact: true })).toBeVisible();
});

test("an unknown session cookie cannot bypass the login-first route", async ({ page, context }) => {
  await context.addCookies([{ name: cookieName, value: "f".repeat(64), url: origin,
    httpOnly: true, sameSite: "Lax", expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await page.goto("/");
  await expectLogin(page);
});

test("an expired browser cookie or restored revoked token cannot reopen the menu", async ({ page, context }) => {
  await registerCustomer(page);
  const session = (await context.cookies()).find(cookie => cookie.name === cookieName);
  expect(session).toBeTruthy();
  expect((await page.request.post("/api/auth/logout", { headers: { origin }, data: {} })).ok()).toBeTruthy();
  await context.addCookies([{ ...session!, expires: Math.floor(Date.now() / 1000) - 60 }]);
  await page.goto("/");
  await expectLogin(page);
  // A stale token can look unexpired to the browser. The server must still look
  // up the revoked session rather than trusting that the cookie merely exists.
  await context.addCookies([{ ...session!, expires: Math.floor(Date.now() / 1000) + 3600 }]);
  await page.goto("/");
  await expectLogin(page);
});

test("signing out prevents Back from restoring the authenticated menu", async ({ page }) => {
  await registerCustomer(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: menuHeading, exact: true })).toBeVisible();
  await page.locator(".topbar").getByRole("link", { name: "Your profile", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/profile`);
  await page.locator(".profile-nav").getByRole("button", { name: "Sign out", exact: true }).click();
  await expectLogin(page);
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  await page.goBack();
  // A logout redirect may replace its entry or add one. If Back first reaches
  // the public profile route, continue to the earlier authenticated menu entry.
  if (new URL(page.url()).pathname === "/profile") {
    await expect(page.locator(".menu-page")).toHaveCount(0);
    await page.goBack();
  }
  await expectLogin(page);
  await expect(page.getByRole("heading", { name: menuHeading, exact: true })).toHaveCount(0);
});
