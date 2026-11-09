import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/demo", {
    headers: { origin: "http://127.0.0.1:3001" }, data: { account: "customer" },
  })).ok()).toBeTruthy();
});

test("menu search is visible on phones and clears a previous category when typing", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search dishes" });
  await expect(search).toBeInViewport();
  await expect(page.locator(".dish-card")).toHaveCount(60);
  await page.getByRole("button", { name: "Sweets", exact: true }).click();
  await search.fill("chicken biriyani");
  await expect(page.getByRole("button", { name: "All dishes", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dish-card").first()).toContainText("Chicken dum biryani");
  await expect(page.locator(".hero")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Menu search" }).getByRole("status")).toContainText("chicken biriyani");
  await search.press("Escape");
  await expect(page.getByRole("listbox", { name: "Food suggestions" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".dish-card")).toHaveCount(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("food suggestions support keyboard selection and never add an item to the cart", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: "Search dishes" });
  await search.fill("bir");
  const options = page.getByRole("listbox", { name: "Food suggestions" });
  await expect(options.getByRole("option").first()).toContainText("Biryani");
  await search.press("ArrowDown");
  await expect(options.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await search.press("Enter");
  await expect(search).toHaveValue("Biryani");
  await expect(options).toHaveCount(0);
  await expect(page.locator(".dish-card")).toHaveCount(8);
  await expect(page.locator(".cart-line")).toHaveCount(0);
  await page.getByLabel("Veg only").check();
  await expect(page.locator(".dish-card")).toHaveCount(3);
  await search.fill("no-such-dish");
  await expect(page.getByRole("heading", { name: "No dishes found" })).toBeVisible();
  await page.getByRole("button", { name: "Show all dishes" }).click();
  await expect(page.locator(".dish-card")).toHaveCount(60);
  await expect(page.getByLabel("Veg only")).not.toBeChecked();
});
