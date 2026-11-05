import { test, expect } from "@playwright/test";
import sharp from "sharp";
const origin = "http://127.0.0.1:3001";

test("mobile dishes are high on screen and allergen disclosures are readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".dish-card").first()).toBeVisible();
  const bounds = await page.locator(".dish-card").first().boundingBox();
  expect(bounds!.y).toBeLessThan(650);
  expect(await page.locator(".allergens").first().evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.getByText("Demo FSSAI number (not a licence):", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Add Chicken dum biryani", exact: true }).click();
  expect(await page.getByRole("dialog").locator(".allergens").evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
});

test("only admins can upload decoded photos and save them in the menu", async ({ page }) => {
  const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "orange" } }).png().toBuffer();
  const denied = await page.request.post("/api/admin/photos", { headers: { origin, "Content-Type": "image/png" }, data: bytes });
  expect(denied.status()).toBe(401);
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } })).ok()).toBeTruthy();
  await page.goto("/workspace/menu");
  await page.getByRole("button", { name: "Edit Chicken dum biryani", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: bytes });
  await expect(dialog.locator(".admin-photo-preview")).toHaveAttribute("src", /^\/api\/media\/[a-f0-9]{32}\.webp$/);
  const photo = await dialog.locator(".admin-photo-preview").getAttribute("src");
  await dialog.getByRole("button", { name: "Save dish", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const menu = await (await page.request.get("/api/admin/menu")).json();
  expect(menu.items.find((item: { id: string }) => item.id === "chicken-biryani").photo).toBe(photo);
  const image = await page.request.get(photo!);
  expect(image.headers()["content-type"]).toBe("image/webp");
  expect((await sharp(await image.body()).metadata()).format).toBe("webp");
  // Restore the menu fixture for independent browser scenarios.
  await page.getByRole("button", { name: "Edit Chicken dum biryani", exact: true }).click();
  await dialog.getByLabel("Photo from your library").selectOption("/food/chicken-biryani.jpg");
  await dialog.getByRole("button", { name: "Save dish", exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
