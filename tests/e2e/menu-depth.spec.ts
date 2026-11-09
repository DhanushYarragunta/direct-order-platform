import { test, expect, type APIRequestContext } from "@playwright/test";
import { mkdirSync } from "node:fs";

const origin = "http://127.0.0.1:3001";
async function demo(api: APIRequestContext, account: string) {
  expect((await api.post("/api/auth/demo", { headers: { origin }, data: { account } })).ok()).toBeTruthy();
}

test("city prices and serving windows publish from the CMS to checkout", async ({ browser, page }) => {
  const admin = await browser.newContext({ baseURL: origin });
  const customer = await browser.newContext({ baseURL: origin });
  await demo(admin.request, "admin");
  await demo(customer.request, "customer");
  await demo(page.request, "customer");
  const original = (await (await admin.request.get("/api/admin/menu")).json()).items.find((item: { id: string }) => item.id === "chicken-biryani");
  const editable = Object.fromEntries([
    "name", "description", "category", "pricePaise", "familyPricePaise", "portion", "vegetarian", "spice",
    "allergens", "photo", "prepMinutes", "active", "featured", "menuDays", "menuStartMinute", "menuEndMinute",
  ].map((field) => [field, original[field]]));
  const cityPrices = original.cityPrices.map((price: { city: string; pricePaise: number; familyPricePaise: number | null }) => ({
    city: price.city, pricePaise: price.pricePaise, familyPricePaise: price.familyPricePaise,
  }));
  try {
    const screen = await admin.newPage();
    await screen.goto("/workspace/menu");
    await screen.getByRole("button", { name: "Edit Chicken dum biryani", exact: true }).click();
    while (await screen.getByRole("button", { name: "Remove city price 1", exact: true }).count())
      await screen.getByRole("button", { name: "Remove city price 1", exact: true }).click();
    await screen.getByRole("button", { name: "Add city price", exact: true }).click();
    await screen.getByLabel("City 1", { exact: true }).fill("Hyderabad");
    await screen.getByLabel("City 1 regular price", { exact: true }).fill("355");
    await screen.getByRole("button", { name: "Save dish", exact: true }).click();
    await expect(screen.getByRole("dialog")).toHaveCount(0);
    await page.goto("/");
    const dish = page.locator(".dish-card").filter({ hasText: "Chicken dum biryani" });
    await expect(dish.getByText("₹355", { exact: true })).toBeVisible();

    await screen.getByRole("button", { name: "Edit Chicken dum biryani", exact: true }).click();
    await screen.getByLabel("Serve during selected hours").check();
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const futureDay = (new Date(Date.now() + 330 * 60000).getUTCDay() + 2) % 7;
    for (let index = 0; index < days.length; index++) {
      const checkbox = screen.getByRole("checkbox", { name: days[index], exact: true });
      if (index === futureDay) await checkbox.check();
      else await checkbox.uncheck();
    }
    await screen.getByLabel("Service starts", { exact: true }).fill("18:00");
    await screen.getByLabel("Service ends", { exact: true }).fill("23:00");
    mkdirSync(".local/screenshots", { recursive: true });
    await screen.getByText("Serving hours", { exact: true }).scrollIntoViewIfNeeded();
    await screen.screenshot({ path: ".local/screenshots/menu-schedule-editor.png", animations: "disabled" });
    await screen.getByRole("button", { name: "Save dish", exact: true }).click();
    await expect(screen.getByRole("dialog")).toHaveCount(0);
    await expect(dish.getByText("Outside serving hours", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(dish.getByRole("button", { name: "Add Chicken dum biryani", exact: true })).toBeDisabled();
    expect((await customer.request.post("/api/orders", {
      headers: { origin }, data: { checkoutKey: crypto.randomUUID(), outletId: "kondapur", fulfillment: "pickup", phone: "9000000000",
        lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular", addOnIds: [] }] },
    })).status()).toBe(409);
    await screen.goto("/kitchen");
    await screen.getByRole("button", { name: "Availability", exact: true }).click();
    const stockRow = screen.locator(".stock-row").filter({ hasText: "Chicken dum biryani" });
    const stockSwitch = stockRow.getByRole("switch");
    await expect(stockRow.getByText("In stock · outside serving hours", { exact: true })).toBeVisible();
    await expect(stockSwitch).toBeChecked();
    await stockSwitch.click();
    await expect(stockSwitch).not.toBeChecked();
    await expect(stockRow.getByText("Out of stock", { exact: true })).toBeVisible();
    await stockSwitch.click();
    await expect(stockSwitch).toBeChecked();
  } finally {
    const restored = await admin.request.patch("/api/admin/menu/chicken-biryani", { headers: { origin }, data: { ...editable, cityPrices } });
    expect(restored.ok()).toBeTruthy();
    await admin.request.patch("/api/staff/availability", { headers: { origin }, data: {
      outletId: "kondapur", itemId: "chicken-biryani",
      available: original.availability.find((entry: { outletId: string }) => entry.outletId === "kondapur")?.available === true,
    } });
    await admin.close();
    await customer.close();
  }
});

test("personal reorder suggestions require an explicit cart action", async ({ page }) => {
  await demo(page.request, "customer");
  await page.goto("/");
  const section = page.getByRole("region", { name: "Order again suggestions" });
  await expect(section).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(0);
  await section.getByRole("button", { name: "Choose Chicken dum biryani again", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".cart-line")).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: /Add to order/ }).click();
  await expect(page.locator(".cart-line")).toHaveCount(1);
});

test("mobile reorder suggestions stay available and need an explicit customized add", async ({ browser, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await demo(page.request, "customer");
  const admin = await browser.newContext({ baseURL: origin });
  await demo(admin.request, "admin");
  const menu = await (await page.request.get("/api/menu?outlet=kondapur")).json();
  const originalStock = menu.items.find((item: { id: string }) => item.id === "chicken-biryani").inStock;
  const stock = async (available: boolean) => {
    expect((await admin.request.patch("/api/staff/availability", { headers: { origin }, data: {
      outletId: "kondapur", itemId: "chicken-biryani", available,
    } })).ok()).toBeTruthy();
  };
  try {
    const history = await (await page.request.get("/api/orders")).json();
    expect(history.orders.some((order: { outletId: string; paymentStatus: string; lines: { itemId: string }[] }) =>
      order.outletId === "kondapur" && order.paymentStatus === "PAID" && order.lines.some(line => line.itemId === "chicken-biryani"),
    )).toBe(true);
    await page.goto("/");
    const section = page.getByRole("region", { name: "Order again suggestions" });
    const chooseChicken = section.getByRole("button", { name: "Choose Chicken dum biryani again", exact: true });
    await expect(section).toBeVisible();
    await expect(page.locator(".cart-line")).toHaveCount(0);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      // Trial clicks retry if account/menu hydration replaces the suggestion.
      await chooseChicken.click({ trial: true });
      await expect(chooseChicken).toBeInViewport();
      const target = await chooseChicken.boundingBox();
      expect(target!.width).toBeGreaterThanOrEqual(44);
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await stock(false);
    await page.reload();
    await expect(section).toBeVisible();
    await expect(chooseChicken).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Choose Double ka meetha again", exact: true })).toBeVisible();
    await expect(page.locator(".cart-line")).toHaveCount(0);
    const availableMenu = await (await page.request.get("/api/menu?outlet=kondapur")).json();
    const availableNames = availableMenu.items.filter((item: { available: boolean }) => item.available).map((item: { name: string }) => item.name);
    for (const name of await section.locator(".reorder-item strong").allTextContents())
      expect(availableNames).toContain(name.trim());

    await stock(true);
    await page.reload();
    await chooseChicken.click({ trial: true });
    mkdirSync(".local/screenshots", { recursive: true });
    await page.screenshot({ path: ".local/screenshots/mobile-reorder.png", animations: "disabled" });
    await chooseChicken.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Family pack · serves 3–4/ }).click();
    await expect(page.locator(".cart-line")).toHaveCount(0);
    await dialog.getByRole("button", { name: /Add to order/ }).click();
    await expect(page.locator(".cart-line")).toHaveCount(1);
    await expect(page.locator(".cart-line")).toContainText("Chicken dum biryani");
    await expect(page.locator(".cart-line")).toContainText("Family pack");
  } finally {
    await stock(originalStock);
    await admin.close();
  }
});
