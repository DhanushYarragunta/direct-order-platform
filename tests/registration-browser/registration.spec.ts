import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:3001";
const password = "browser-registration-password!";
async function emailCode(challengeId: string, email: string) {
  const message = JSON.parse(await readFile(join(process.env.REGISTRATION_TEST_OUTBOX!, `${challengeId}.json`), "utf8"));
  expect(message.to).toEqual([email]);
  expect(message.subject).toBe("Verify your Deccan Kitchen email");
  const code = /Your code is (\d{6})/.exec(message.text)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  return code!;
}
async function openRegistration(page: Page, email: string) {
  await page.goto("/login?next=/privacy");
  await expect(page.getByRole("button", { name: "Email code", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Signup browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(email);
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
  await openRegistration(page, email);
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
  expect(user).toMatchObject({ email, role: "CUSTOMER", marketingOptIn: false });
  expect(user.emailVerifiedAt).not.toBeNull();
  const replay = await page.request.post("/api/auth/register/verify", { headers: { origin }, data: { challengeId: replacement.challengeId, code, password } });
  expect(replay.status()).toBe(400);
  await page.request.post("/api/auth/logout", { headers: { origin } });
  const login = await page.request.post("/api/auth/login", { headers: { origin }, data: { email, password } });
  expect(login.status()).toBe(200);
  expect((await (await page.request.get("/api/auth/me")).json()).user.id).toBe(user.id);
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
