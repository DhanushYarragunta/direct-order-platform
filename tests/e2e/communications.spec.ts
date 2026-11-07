import { expect, test } from "@playwright/test";

test("password signup and verified contact linking preserve one account", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const email = `email-browser-${suffix}@customer.test`;
  await page.goto("/login?next=/privacy");
  await expect(page.getByRole("button", { name: /^Email code|^Phone code/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Email browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("contact-browser-password!");
  await page.getByRole("checkbox", { name: /I agree to the use of my details/ }).check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/privacy");
  await expect(page.getByRole("heading", { name: "Verified contacts for order updates" })).toBeVisible();
  const original = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(original).not.toBeNull();
  expect(original.emailVerifiedAt).toBeNull();

  await page.getByText("Add or verify email", { exact: true }).click();
  const emailForm = page.locator(".contact-verification details").filter({ hasText: "Add or verify email" });
  await emailForm.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await emailForm.getByRole("button", { name: "Get demo code", exact: true }).click();
  const firstCode = await emailForm.locator("[role=status] strong").textContent();
  await emailForm.getByLabel("Six-digit code").fill(firstCode!);
  await emailForm.getByRole("button", { name: "Use another email or request a new code", exact: true }).click();
  await expect(emailForm.getByLabel("Email address", { exact: true })).toHaveValue(email);
  await emailForm.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await emailForm.getByRole("button", { name: "Get demo code", exact: true }).click();
  const replacementCode = await emailForm.locator("[role=status] strong").textContent();
  await emailForm.getByLabel("Six-digit code").fill(replacementCode!);
  await emailForm.getByRole("button", { name: "Verify contact", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo contact saved" })).toBeVisible();

  await page.getByText("Add or verify mobile number", { exact: true }).click();
  const phoneForm = page.locator(".contact-verification details").filter({ hasText: "Add or verify mobile number" });
  const phone = `7${String(Date.now()).slice(-9)}`;
  await phoneForm.getByLabel("Mobile number", { exact: true }).fill(phone);
  await phoneForm.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await phoneForm.getByRole("button", { name: "Get demo code", exact: true }).click();
  const phoneCode = await phoneForm.locator("[role=status] strong").textContent();
  await phoneForm.getByLabel("Six-digit code").fill(phoneCode!);
  // The email step already displayed this success message. Wait for the phone
  // mutation itself, rather than mistaking that previous status for completion.
  const phoneVerified = page.waitForResponse(response => response.url().endsWith("/api/auth/phone/verify") && response.request().method() === "POST");
  await phoneForm.getByRole("button", { name: "Verify contact", exact: true }).click();
  const phoneResponse = await phoneVerified;
  expect(phoneResponse.status()).toBe(200);
  await phoneResponse.finished();
  await expect(page.getByRole("status").filter({ hasText: "Demo contact saved" })).toBeVisible();
  const linked = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(linked).toMatchObject({ id: original.id, phone, emailVerifiedAt: null, phoneVerifiedAt: null });
});
