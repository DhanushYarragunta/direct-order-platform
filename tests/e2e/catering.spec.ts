import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = "http://127.0.0.1:3001";

test("party request reaches its manager and the customer sees confirmation", async ({
  page,
  browser,
}) => {
  await page.request.post("/api/auth/demo", {
    headers: { origin },
    data: { account: "customer" },
  });
  await page.goto("/catering");
  await expect(
    page.getByRole("heading", { name: "Feed your gathering." }),
  ).toBeVisible();
  await page
    .getByLabel("Occasion", { exact: true })
    .fill("Browser review celebration");
  await page
    .getByLabel("Catering kitchen", { exact: true })
    .selectOption("kondapur");
  await page.getByLabel("Number of guests").fill("30");
  await page
    .getByLabel("Menu and dietary requirements")
    .fill("20 chicken and 10 vegetarian biryani meals. Please include raita.");
  await page
    .getByLabel("Preferred total budget", { exact: false })
    .fill("18000");
  await page.getByLabel("Mobile number").fill("9000000000");
  await page
    .getByLabel("Event address")
    .fill("Demo celebration hall, Kondapur, Hyderabad");
  mkdirSync(".local/screenshots", { recursive: true });
  await page.screenshot({
    path: ".local/screenshots/catering-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".local/screenshots/catering-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/catering") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Send party request", exact: true })
    .click();
  const response = await created;
  expect(response.status()).toBe(201);
  const saved = await response.json();
  const card = page.locator(".catering-card").filter({ hasText: saved.number });
  await expect(card.getByText("Awaiting reply", { exact: true })).toBeVisible();
  const manager = await browser.newContext({ baseURL: origin });
  await manager.request.post("/api/auth/demo", {
    headers: { origin },
    data: { account: "manager" },
  });
  const workspace = await manager.newPage();
  await workspace.goto("/workspace/catering");
  const staffCard = workspace
    .locator(".catering-card")
    .filter({ hasText: saved.number });
  await staffCard.getByRole("button", { name: "Review request" }).click();
  await workspace
    .getByLabel("Confirmation details")
    .fill(
      "Confirmed: 30 meals, requested menu, ₹18,000 including GST. Delivery at the requested event time.",
    );
  await workspace.getByRole("button", { name: "Send reply" }).click();
  await expect(workspace.getByRole("dialog")).not.toBeVisible();
  await workspace
    .getByLabel("Catering request status", { exact: true })
    .selectOption("CONFIRMED");
  await expect(staffCard.getByText("Confirmed", { exact: true })).toBeVisible();
  await workspace.screenshot({
    path: ".local/screenshots/catering-manager.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Refresh party requests" }).click();
  await expect(card.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(card.getByText(/Confirmed: 30 meals/)).toBeVisible();
  expect((await page.request.get("/api/staff/catering")).status()).toBe(403);
  await manager.close();
});
