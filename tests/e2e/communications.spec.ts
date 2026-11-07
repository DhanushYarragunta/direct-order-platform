import { expect, test } from "@playwright/test";

test("email-code sign-in and contact linking preserve one account without trusting demo ownership", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await page.goto("/login?next=/privacy");
  await page.getByRole("button", { name: "Email code · demo", exact: true }).click();
  await page.getByLabel("Your name", { exact: true }).fill("Email browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(`email-browser-${suffix}@customer.test`);
  await page.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await page.getByRole("button", { name: "Get demo code", exact: true }).click();
  const code = await page.locator(".phone-sign-in [role=status] strong").textContent();
  await page.getByLabel("Six-digit code").fill(code!);
  await page.getByRole("button", { name: "Use another email or request a new code", exact: true }).click();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("");
  await page.getByLabel("Your name", { exact: true }).fill("Email browser customer");
  await page.getByLabel("Email address", { exact: true }).fill(`email-browser-${suffix}@customer.test`);
  await page.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await page.getByRole("button", { name: "Get demo code", exact: true }).click();
  const replacementCode = await page.locator(".phone-sign-in [role=status] strong").textContent();
  await page.getByLabel("Six-digit code").fill(replacementCode!);
  await page.getByRole("button", { name: "Verify code and sign in" }).click();
  // The login URL also ends in "next=/privacy". Wait for the pathname itself
  // and authenticated content so the session response/navigation has completed.
  await expect(page).toHaveURL(url => url.pathname === "/privacy");
  await expect(page.getByRole("heading", { name: "Verified contacts for order updates" })).toBeVisible();
  const original = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(original).not.toBeNull();
  expect(original.emailVerifiedAt).toBeNull();

  await page.getByText("Add or verify mobile number", { exact: true }).click();
  const phoneForm = page.locator(".contact-verification details").filter({ hasText: "Add or verify mobile number" });
  const phone = `7${String(Date.now()).slice(-9)}`;
  await phoneForm.getByLabel("Mobile number", { exact: true }).fill(phone);
  await phoneForm.getByRole("checkbox", { name: /I agree to using my details/ }).check();
  await phoneForm.getByRole("button", { name: "Get demo code", exact: true }).click();
  const phoneCode = await phoneForm.locator("[role=status] strong").textContent();
  await phoneForm.getByLabel("Six-digit code").fill(phoneCode!);
  await phoneForm.getByRole("button", { name: "Verify contact", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Demo contact saved" })).toBeVisible();
  const linked = (await (await page.request.get("/api/auth/me")).json()).user;
  expect(linked).toMatchObject({ id: original.id, phone, emailVerifiedAt: null, phoneVerifiedAt: null });
});
