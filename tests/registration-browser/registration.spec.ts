import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3001";
const password = "browser-registration-password!";
async function emailCode(challengeId: string, email: string, subject = "Verify your Deccan Kitchen email") {
  const path = join(process.env.REGISTRATION_TEST_OUTBOX!, `${challengeId}.json`);
  await expect.poll(async () => readFile(path, "utf8").then(() => true).catch(() => false)).toBe(true);
  const message = JSON.parse(await readFile(path, "utf8"));
  expect(message.to).toEqual([email]);
  expect(message.subject).toBe(subject);
  const code = /Your code is (\d{6})/.exec(message.text)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}
async function openRegistration(page: Page, email: string, phone?: string) {
  await page.goto("/login?next=/privacy");
  await expect(page.getByLabel("Email or mobile number", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Email code|^Phone code/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Signup browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  if (phone) await page.getByLabel("Mobile number (optional)", { exact: true }).fill(phone);
  await page.getByRole("checkbox", { name: /I agree to using my details/ }).check();
}
async function sendCode(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/api/auth/register") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Send verification code", exact: true }).click();
  const sent = await response;
  expect(sent.status()).toBe(202);
  expect(sent.request().postDataJSON()).not.toHaveProperty("password");
  expect(sent.headers()["set-cookie"]).toBeUndefined();
  const challenge = await sent.json();
  expect(challenge).toMatchObject({ verificationRequired: true, delivery: "email" });
  expect(challenge).not.toHaveProperty("demoCode");
  return challenge as { challengeId: string };
}

test("new signup verifies the recipient before creating an account and supports later password sign-in", async ({ page }) => {
  const email = `signup-${randomUUID()}@customer.test`;
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = `9${String(Date.now()).slice(-9)}`;
  await openRegistration(page, email, `+91 ${phone}`);
  await expect(page.getByLabel("Create password", { exact: true })).toHaveCount(0);
  const first = await sendCode(page);
  const firstCode = await emailCode(first.challengeId, email);
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  const prematureLogin = await page.request.post("/api/auth/login", { headers: { origin }, data: { email, password } });
  expect(prematureLogin.status()).toBe(401);
  await expect(page.getByRole("status").filter({ hasText: "We sent a verification code" })).toContainText(email);
  await page.getByLabel("Six-digit code").fill(firstCode === "000000" ? "000001" : "000000");
  await page.getByLabel("Create password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Verify email and create account", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("Incorrect code");
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();

  await page.getByRole("button", { name: "Use another email or request a new code", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(email);
  await expect(page.getByRole("checkbox", { name: /I agree to using my details/ })).toBeChecked();
  const replacement = await sendCode(page);
  const code = await emailCode(replacement.challengeId, email);
  const oldCode = await page.request.post("/api/auth/register/verify", { headers: { origin }, data: { challengeId: first.challengeId, code: firstCode, password } });
  expect(oldCode.status()).toBe(400);
  await page.getByLabel("Six-digit code").fill(code);
  await page.getByLabel("Create password", { exact: true }).fill(password);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/screenshots/registration-mobile.png", animations: "disabled" });
  await page.getByRole("button", { name: "Verify email and create account", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/privacy");
  const user = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(user).toMatchObject({ email, phone, phoneVerifiedAt: null, role: "CUSTOMER", marketingOptIn: false });
  expect(user.emailVerifiedAt).not.toBeNull();
  const replay = await page.request.post("/api/auth/register/verify", { headers: { origin }, data: { challengeId: replacement.challengeId, code, password } });
  expect(replay.status()).toBe(400);
  await page.request.post("/api/auth/logout", { headers: { origin } });
  await page.goto("/login?next=/privacy");
  await page.getByLabel("Email or mobile number", { exact: true }).fill(`+91 ${phone}`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/privacy");
  expect((await (await page.request.get("/api/auth/me")).json()).user.id).toBe(user.id);
  const session = (await page.context().cookies()).find(cookie => cookie.name === "company_a_session");
  expect(session?.expires).toBeGreaterThan(Date.now() / 1000 + 14.9 * 86400);
  expect(session?.expires).toBeLessThan(Date.now() / 1000 + 15.1 * 86400);

});

test("email delivery failure stays on signup and allows a different recipient to retry", async ({ page }) => {
  await openRegistration(page, `unavailable-${randomUUID()}@customer.test`);
  await page.getByRole("button", { name: "Send verification code", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("could not be sent");
  await expect(page.getByLabel("Six-digit code")).toHaveCount(0);
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  const email = `recovered-${randomUUID()}@customer.test`;
  await page.getByLabel("Email address", { exact: true }).fill(email);
  const challenge = await sendCode(page);
  await emailCode(challenge.challengeId, email);
  await expect(page.getByRole("status").filter({ hasText: "We sent a verification code" })).toContainText(email);
});

test("rejected signup email explains how to get account access", async ({ page }) => {
  const email = `rejected-${randomUUID()}@customer.test`;
  await openRegistration(page, email);
  await page.getByRole("button", { name: "Send verification code", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toContainText("Email verification is unavailable for this address");
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Six-digit code")).toHaveCount(0);
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  await page.getByRole("link", { name: "Get help with account access" }).click();
  await expect(page).toHaveURL(/\/help#account-access$/);
  await expect(page.getByRole("heading", { name: "Signing in and email codes" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in with your email or mobile number and password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
});

test("forgot password verifies email OTP, revokes old sessions and requires the new password", async ({ page, browser }) => {
  const email = `reset-${randomUUID()}@customer.test`, newPassword = "new-browser-password!";
  const signup = await page.request.post("/api/auth/register", { headers: { origin }, data: { email, name: "Reset browser customer", consent: true } });
  expect(signup.status()).toBe(202);
  const { challengeId: signupId } = await signup.json();
  const signupCode = await emailCode(signupId, email);
  expect((await page.request.post("/api/auth/register/verify", { headers: { origin }, data: { challengeId: signupId, code: signupCode, password } })).status()).toBe(201);
  const oldSession = await browser.newContext({ baseURL: origin });
  expect((await oldSession.request.post("/api/auth/login", { headers: { origin }, data: { identifier: email, password } })).status()).toBe(200);
  await page.request.post("/api/auth/logout", { headers: { origin } });
  await page.goto("/login?next=/privacy");
  await page.getByLabel("Email or mobile number", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(page.getByLabel("Email or mobile number", { exact: true })).toHaveValue(email);
  await expect(page.getByText("SMS recovery is not available yet. Use your verified email address.")).toBeVisible();
  const requested = page.waitForResponse(response => response.url().endsWith("/api/auth/password/request"));
  await page.getByRole("button", { name: "Send reset code", exact: true }).click();
  const response = await requested;
  expect(response.status()).toBe(202);
  const challenge = await response.json();
  expect(challenge).not.toHaveProperty("demoCode");
  await expect(page.locator(".auth-card").getByRole("status")).toContainText("If a matching verified account exists");
  const code = await emailCode(challenge.challengeId, email, "Reset your Deccan Kitchen password");
  await page.getByLabel("Six-digit code", { exact: true }).fill(code === "000000" ? "000001" : "000000");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.locator(".auth-card").getByRole("alert")).toBeVisible();
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  await page.getByLabel("Six-digit code", { exact: true }).fill(code);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/screenshots/password-reset-mobile.png", animations: "disabled" });
  await page.getByRole("button", { name: "Reset password", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password updated. Sign in with your new password." })).toBeVisible();
  await expect(page.getByLabel("Email or mobile number", { exact: true })).toHaveValue(email);
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect((await (await page.request.get("/api/auth/me")).json()).user).toBeNull();
  expect((await (await oldSession.request.get("/api/auth/me")).json()).user).toBeNull();
  expect((await page.request.post("/api/auth/login", { headers: { origin }, data: { identifier: email, password } })).status()).toBe(401);
  expect((await page.request.post("/api/auth/password/verify", { headers: { origin }, data: { challengeId: challenge.challengeId, code, password: "another-new-password!" } })).status()).toBe(400);
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/privacy");
  await oldSession.close();
});

test("unavailable SMS recovery is explained without claiming a code was sent", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await page.getByLabel("Email or mobile number", { exact: true }).fill("9876543210");
  await expect(page.getByRole("button", { name: "Send reset code", exact: true })).toBeDisabled();
  await expect(page.getByText("SMS recovery is not available yet. Use your verified email address.")).toBeVisible();
  await expect(page.getByLabel("Six-digit code", { exact: true })).toHaveCount(0);
});
