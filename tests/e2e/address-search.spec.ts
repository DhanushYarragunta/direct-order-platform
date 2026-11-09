import { test, expect, type Page } from "@playwright/test";
import type { LocationSuggestion } from "../../src/lib/profile-types";

const kondapur: LocationSuggestion = {
  id: "fixture:kondapur-office", name: "Kondapur RTA Office", address: "Kondapur RTA Office, Hafeezpet Road, Hyderabad, 500084",
  city: "Hyderabad", pincode: "500084", latitude: 17.472253, longitude: 78.365155, kind: "place",
};
const gachibowli: LocationSuggestion = {
  id: "fixture:gachibowli-library", name: "Gachibowli Library", address: "Gachibowli Library, Hyderabad, 500032",
  city: "Hyderabad", pincode: "500032", latitude: 17.4401, longitude: 78.3489, kind: "place",
};
const searchResult = (results: LocationSuggestion[]) => ({ results, provider: "photon", attribution: "© OpenStreetMap contributors · Search by Photon" });
const json = (value: unknown) => ({ contentType: "application/json", body: JSON.stringify(value) });

test.beforeEach(async ({ page }) => {
  expect((await page.request.post("/api/auth/demo", {
    headers: { origin: "http://127.0.0.1:3001" }, data: { account: "customer" },
  })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  // Authenticate the menu entry, then keep location tests independent of saved
  // addresses, restaurant state and external providers.
  const profileResponse = await page.request.get("/api/account/profile");
  expect(profileResponse.ok()).toBeTruthy();
  const profile = { ...await profileResponse.json(), addresses: [] };
  await page.route("**/api/account/profile*", route => route.fulfill(json(profile)));
  const outlets = [
    { id: "kondapur", name: "Kondapur", latitude: 17.462, longitude: 78.357 },
    { id: "gachibowli", name: "Gachibowli", latitude: 17.4401, longitude: 78.3489 },
  ].map(outlet => ({ ...outlet, city: "Hyderabad", address: `${outlet.name}, Hyderabad`, radiusKm: 5, minPrepMinutes: 25,
    fssai: "00000000000000", fssaiVerified: false, deliveryFeePaise: 4000, minDeliveryPaise: 19900, freeDeliveryAbovePaise: 59900, open: true }));
  await page.route("**/api/menu?**", route => {
    const outletId = new URL(route.request().url()).searchParams.get("outlet");
    return route.fulfill(json({ outlets, outlet: outlets.find(outlet => outlet.id === outletId) || outlets[0], items: [], addOns: [], suggestedItemIds: [] }));
  });
  await page.route("**/api/events?**", route => route.fulfill({ contentType: "text/event-stream", body: "data: {}\n\n" }));
});

async function openLocation(page: Page) {
  await page.goto("/");
  // The loading state clears after the mounted menu has consumed its fixture.
  await expect(page.locator(".menu-page .loading")).toHaveCount(0);
  await page.locator(".topbar").getByRole("button", { name: "Change delivery location", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Where should we deliver?", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("location suggestions support keyboard selection and require an explicit choice", async ({ page }) => {
  await page.route("**/api/locations/search?**", route => route.fulfill(json(searchResult([kondapur, gachibowli]))));
  const dialog = await openLocation(page);
  const search = dialog.getByRole("combobox", { name: "Search delivery location", exact: true });
  const suggestions = dialog.getByRole("listbox", { name: "Location suggestions", exact: true });
  await search.fill("Kondapur");
  await expect(suggestions.getByRole("option")).toHaveCount(2);
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await search.press("Enter");
  await expect(dialog.getByRole("button", { name: "Use this location", exact: true })).toHaveCount(0);
  await search.press("ArrowUp");
  await expect(suggestions.getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowDown");
  await expect(suggestions.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", await suggestions.getByRole("option").first().getAttribute("id") as string);
  await search.press("Enter");
  await expect(search).toHaveValue(kondapur.name);
  await expect(suggestions).toHaveCount(0);
  await expect(dialog.locator(".location-preview")).toContainText(kondapur.name);
  await dialog.getByRole("button", { name: "Use this location", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".topbar .delivery-header-button")).toContainText(kondapur.name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("editing a location query clears the previously chosen place until a new suggestion is selected", async ({ page }) => {
  await page.route("**/api/locations/search?**", route => {
    const query = new URL(route.request().url()).searchParams.get("q") || "";
    return route.fulfill(json(searchResult(query.startsWith("Gachi") ? [gachibowli] : [kondapur])));
  });
  const dialog = await openLocation(page);
  const search = dialog.getByRole("combobox", { name: "Search delivery location", exact: true });
  const useLocation = dialog.getByRole("button", { name: "Use this location", exact: true });
  await search.fill("Kondapur");
  await dialog.getByRole("option", { name: /Kondapur RTA Office/ }).click();
  await expect(useLocation).toBeVisible();
  await search.fill("Gachibowli");
  await expect(useLocation).toHaveCount(0);
  await expect(dialog.locator(".location-preview")).toHaveCount(0);
  await search.press("Enter");
  await expect(useLocation).toHaveCount(0);
  await dialog.getByRole("option", { name: /Gachibowli Library/ }).click();
  await expect(dialog.locator(".location-preview")).toContainText(gachibowli.name);
  await useLocation.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".topbar .delivery-header-button")).toContainText(gachibowli.name);
});

test("failed map search and area-only fallback offer a working retry without selecting an address", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/locations/search?**", route => {
    attempts += 1;
    if (attempts === 1) return route.fulfill({ status: 503, ...json({ error: "Place search could not be reached. Try again." }) });
    if (attempts === 2) return route.fulfill(json({ results: [{ ...kondapur, id: "local:kondapur", name: "Kondapur centre",
      address: "Kondapur centre, Hyderabad, 500084", kind: "area", localityId: "kondapur" }], provider: "local",
      attribution: "Deccan Kitchen supported areas", warning: "Map search is temporarily unavailable. These suggestions use supported area centres." }));
    return route.fulfill(json(searchResult([kondapur])));
  });
  const dialog = await openLocation(page);
  await dialog.getByRole("combobox", { name: "Search delivery location", exact: true }).fill("Kondapur");
  await expect(dialog.locator(".address-search-status")).toContainText("Place search could not be reached");
  await expect(dialog.getByRole("button", { name: "Use this location", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Try map search again", exact: true }).click();
  await expect(dialog.getByRole("option", { name: /Kondapur centre/ })).toContainText("Area centre · full address needed");
  await expect(dialog.locator(".address-search-status")).toContainText("temporarily unavailable");
  await expect(dialog.getByRole("button", { name: "Use this location", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Try map search again", exact: true }).click();
  await expect(dialog.getByRole("option", { name: /Kondapur RTA Office/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /Kondapur centre/ })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "© OpenStreetMap contributors", exact: true })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  expect(attempts).toBe(3);
});

test("a late GPS callback cannot replace a location selected from search", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { pendingTestGps?: PositionCallback; testGpsRequested?: boolean };
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success: PositionCallback) { state.pendingTestGps = success; state.testGpsRequested = true; },
    } });
  });
  await page.route("**/api/locations/search?**", route => route.fulfill(json(searchResult([kondapur]))));
  const dialog = await openLocation(page);
  await dialog.getByRole("button", { name: /^Use current location/ }).click();
  await expect(dialog.getByRole("button", { name: /^Finding your location/ })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { testGpsRequested?: boolean }).testGpsRequested)).toBe(true);
  await dialog.getByRole("combobox", { name: "Search delivery location", exact: true }).fill("Kondapur RTA");
  await dialog.getByRole("option", { name: /Kondapur RTA Office/ }).click();
  await page.evaluate(() => {
    const state = window as unknown as { pendingTestGps?: PositionCallback };
    if (!state.pendingTestGps) throw new Error("The test did not capture a GPS request");
    state.pendingTestGps({ coords: { latitude: 17.4948, longitude: 78.3996 }, timestamp: Date.now() } as GeolocationPosition);
  });
  await expect(dialog.locator(".location-preview")).toContainText(kondapur.name);
  await expect(dialog.locator(".location-preview")).not.toContainText("Current GPS location");
  await dialog.getByRole("button", { name: "Use this location", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".topbar .delivery-header-button")).toContainText(kondapur.name);
});
