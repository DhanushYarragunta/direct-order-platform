import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { mkdirSync } from "node:fs";
const origin = "http://127.0.0.1:3001";
async function demo(api: APIRequestContext, account: string) {
  const r = await api.post("/api/auth/demo", {
    headers: { origin },
    data: { account },
  });
  expect(r.ok()).toBeTruthy();
}
async function screenshot(page: Page, name: string) {
  mkdirSync(".local/screenshots", { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  await page.screenshot({
    path: `.local/screenshots/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
}

test("responsive real-photo menu and working filters", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Chicken dum biryani", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dish-card")).toHaveCount(4);
  expect(
    await page
      .locator(".dish-image img")
      .evaluateAll((images) =>
        images.every(
          (i) =>
            (i as HTMLImageElement).complete &&
            (i as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBeTruthy();
  await screenshot(page, "menu-desktop");
  await page.getByLabel("Veg only").check();
  await expect(page.locator(".dish-card")).toHaveCount(3);
  await page.getByLabel("Search dishes").fill("salan");
  await expect(page.locator(".dish-card")).toHaveCount(1);
  await page.getByLabel("Search dishes").fill("nothingmatches");
  await expect(page.getByText("No dishes found")).toBeVisible();
  await page.getByRole("button", { name: "Show all dishes" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await screenshot(page, "menu-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("customer payment reaches the correct kitchen and tracks through handoff", async ({
  browser,
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Customer", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole("button", { name: "Add Chicken dum biryani", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Add to order/ })
    .click();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".cart-line")).toHaveCount(1);
  await page.getByRole("link", { name: "Continue to checkout" }).click();
  await page.getByLabel("Mobile number").fill("9000000000");
  await screenshot(page, "checkout");
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await expect(
    page.getByRole("heading", { name: "One last step." }),
  ).toBeVisible();
  await page.getByLabel("Payment result").selectOption("pending");
  await page.getByRole("button", { name: /Pay ₹/ }).click();
  await expect(
    page.getByText("Payment is processing.", { exact: false }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/, { timeout: 25000 });
  const id = new URL(page.url()).pathname.split("/").pop()!;
  const order = await (await page.request.get(`/api/orders/${id}`)).json();
  expect(order.outletId).toBe("kondapur");
  const kitchen = await browser.newContext({ baseURL: origin });
  await demo(kitchen.request, "kitchen-kondapur");
  const screen = await kitchen.newPage();
  await screen.goto(`${origin}/kitchen`);
  const ticket = screen
    .locator(".kitchen-ticket")
    .filter({ hasText: order.number });
  await expect(ticket).toBeVisible();
  await ticket.getByRole("button", { name: "Start preparing" }).click();
  await expect(
    ticket.getByRole("button", { name: "Mark ready" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".order-detail-heading")
      .getByText("In the kitchen", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await screenshot(screen, "kitchen-desktop");
  await screenshot(page, "order-tracking");
  await ticket.getByRole("button", { name: "Mark ready" }).click();
  await expect(
    ticket.getByRole("button", { name: "Confirm handoff" }),
  ).toBeVisible();
  await ticket.getByRole("button", { name: "Confirm handoff" }).click();
  await expect(ticket).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Enjoy every bite." }),
  ).toBeVisible({ timeout: 15000 });
  await kitchen.close();
});

test("menu CMS and outlet stock changes reach the customer menu", async ({
  browser,
  page,
}) => {
  const admin = await browser.newContext({ baseURL: origin });
  await demo(admin.request, "admin");
  const manager = await admin.newPage();
  await manager.goto(`${origin}/workspace/menu`);
  await expect(
    manager.getByRole("heading", { name: "A menu worth coming back for." }),
  ).toBeVisible();
  await expect(manager.locator(".admin-dish")).toHaveCount(5);
  await screenshot(manager, "menu-manager");
  await manager
    .getByRole("button", { name: "Edit Chicken dum biryani" })
    .click();
  await manager.getByLabel("Regular price (₹, incl. GST)").fill("325");
  await manager.getByRole("button", { name: "Save dish", exact: true }).click();
  await expect(manager.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  const dish = page
    .locator(".dish-card")
    .filter({ hasText: "Chicken dum biryani" });
  await expect(dish.getByText("₹325", { exact: true })).toBeVisible();
  await manager
    .getByRole("switch", {
      name: "Chicken dum biryani at Kondapur",
      exact: true,
    })
    .click();
  await expect(
    dish.getByRole("button", { name: "Add Chicken dum biryani" }),
  ).toBeDisabled({ timeout: 15000 });
  await manager
    .getByRole("switch", {
      name: "Chicken dum biryani at Kondapur",
      exact: true,
    })
    .click();
  await expect(
    dish.getByRole("button", { name: "Add Chicken dum biryani" }),
  ).toBeEnabled({ timeout: 15000 });
  await manager
    .getByRole("button", { name: "Edit Chicken dum biryani" })
    .click();
  await manager.getByLabel("Regular price (₹, incl. GST)").fill("320");
  await manager.getByRole("button", { name: "Save dish", exact: true }).click();
  await admin.close();
});

test("API rejects unauthorised access, cross-outlet streams and forged prices", async ({
  browser,
  request: api,
}) => {
  expect((await api.get("/api/admin/menu")).status()).toBe(401);
  const customer = await browser.newContext({ baseURL: origin });
  await demo(customer.request, "customer");
  expect((await customer.request.get("/api/admin/menu")).status()).toBe(403);
  const forged = await customer.request.post("/api/orders", {
    headers: { origin },
    data: {
      checkoutKey: crypto.randomUUID(),
      outletId: "kondapur",
      lines: [
        {
          itemId: "chicken-biryani",
          portion: "regular",
          quantity: 1,
          addOnIds: [],
        },
      ],
      fulfillment: "pickup",
      phone: "9000000000",
      totalPaise: 1,
    },
  });
  expect(forged.status()).toBe(400);
  expect(
    (
      await customer.request.post("/api/auth/logout", {
        headers: { origin: "https://untrusted.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const kitchen = await browser.newContext({ baseURL: origin });
  await demo(kitchen.request, "kitchen-kukatpally");
  expect(
    (await kitchen.request.get("/api/staff/orders?outlet=kondapur")).status(),
  ).toBe(403);
  expect(
    (
      await kitchen.request.get("/api/events?scope=kitchen&outlet=kondapur")
    ).status(),
  ).toBe(403);
  const session = await customer.cookies();
  expect(session.find((c) => c.name === "company_a_session")?.httpOnly).toBe(
    true,
  );
  await customer.close();
  await kitchen.close();
});
