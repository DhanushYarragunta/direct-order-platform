import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync } from "node:fs";

const origin = "http://127.0.0.1:3001";
async function signIn(api: APIRequestContext, account: string) {
  expect((await api.post("/api/auth/demo", { headers: { origin }, data: { account } })).ok()).toBeTruthy();
}

test("judges can compare learned estimates, safe fallbacks, manager overrides and late-message previews", async ({ page }) => {
  await signIn(page.request, "admin");
  await page.goto("/workspace/ai");
  await expect(page.getByRole("heading", { name: "AI & automation", exact: true })).toBeVisible();
  const result = page.getByRole("region", { name: "Estimate result" });
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Busy kitchen", exact: true }).click();
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limited history", exact: true }).click();
  await expect(result.getByText("Kitchen-load fallback", { exact: true })).toBeVisible();
  await expect(result.getByText("Fewer than 60 completed examples are available.")).toBeVisible();
  await result.getByText("Synthetic demo evaluation — not measured restaurant accuracy", { exact: true }).click();
  await expect(result.locator(".ai-evaluation-details")).toContainText("20");
  await page.getByRole("button", { name: "Unusual load", exact: true }).click();
  await expect(result.getByText("This workload is outside the examples the model has seen.")).toBeVisible();
  await page.getByRole("button", { name: "Ten minutes late", exact: true }).click();
  await expect(result.getByText("Manager alert preview", { exact: true })).toBeVisible();
  const messages = page.getByRole("region", { name: "Message previews" });
  await expect(messages).toContainText("Preview only · Outlet manager");
  await expect(messages).toContainText("Nothing is sent or saved.");
  await page.getByRole("button", { name: "Manager override", exact: true }).click();
  await expect(result).toContainText("Manager override preview: 45 minutes from now.");
  await expect(result.getByText("No late alert in this scenario", { exact: true })).toBeVisible();
  mkdirSync(".local/screenshots", { recursive: true });
  await page.getByRole("button", { name: "Busy kitchen", exact: true }).click();
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/screenshots/ai-workspace-desktop.png", fullPage: true, animations: "disabled" });
});

test("AI scenarios enforce account and outlet boundaries and remain usable on mobile", async ({ page }) => {
  expect((await page.request.get("/api/staff/ai")).status()).toBe(401);
  await signIn(page.request, "customer");
  expect((await page.request.get("/api/staff/ai")).status()).toBe(403);
  await page.goto("/workspace/ai");
  await expect(page.getByText("Management access required", { exact: true })).toBeVisible();
  await signIn(page.request, "manager");
  expect((await page.request.get("/api/staff/ai?outlet=gachibowli")).status()).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const result = page.getByRole("region", { name: "Estimate result" });
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Limited history", exact: true }).click();
  await expect(result.getByText("Kitchen-load fallback", { exact: true })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const control = await page.getByRole("button", { name: "Evaluate scenario", exact: true }).boundingBox();
    expect(control!.height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({ path: ".local/screenshots/ai-workspace-mobile.png", animations: "disabled" });
  const snapshot = await (await page.request.get("/api/staff/ai")).json();
  expect((await page.request.post("/api/staff/ai", { headers: { origin: "https://untrusted.example" }, data: snapshot.evaluation.input })).status()).toBe(403);
  expect((await page.request.post("/api/staff/ai", { headers: { origin }, data: { ...snapshot.evaluation.input, recipient: "not-used@example.com" } })).status()).toBe(400);
});

test("test checkout presents its learned estimate as a demo", async ({ page }) => {
  await signIn(page.request, "customer");
  await page.goto("/");
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await page.getByRole("link", { name: "Continue to checkout", exact: true }).click();
  await expect(page.locator(".pickup-address small")).toContainText("Demo estimate learned from sample kitchen orders and adjusted for the current kitchen load.");
});

test("AI workspace recovers from interrupted responses without showing a broken result", async ({ page }) => {
  await signIn(page.request, "admin");
  const interrupted = new Set(["GET", "POST"]);
  await page.route("**/api/staff/ai*", async (route) => {
    const method = route.request().method();
    if (interrupted.delete(method)) {
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"evaluation":' });
    } else {
      await route.continue();
    }
  });
  await page.goto("/workspace/ai");
  const error = page.getByRole("main").getByRole("alert");
  await expect(error).toContainText("The server returned an invalid response. Please try again.");
  await error.getByRole("button", { name: "Try again", exact: true }).click();
  const result = page.getByRole("region", { name: "Estimate result" });
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Busy kitchen", exact: true }).click();
  await expect(error).toContainText("The server returned an invalid response. Please try again.");
  await expect(result.getByText("Learned demo estimate", { exact: true })).toHaveCount(0);
  await error.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(result.getByText("Learned demo estimate", { exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
});
