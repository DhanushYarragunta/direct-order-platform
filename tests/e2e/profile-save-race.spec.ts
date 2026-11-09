import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:3001";
const place = {
  id: "kukatpally-save-race", name: "Kukatpally", address: "Kukatpally, Hyderabad",
  city: "Hyderabad", pincode: "500072", latitude: 17.4948, longitude: 78.3996,
  localityId: "kukatpally", kind: "area",
};

test("a dismissed address save persists without closing a new editor or replacing its location choice", async ({ page }) => {
  const registration = await page.request.post("/api/auth/register", { headers: { origin }, data: {
    name: "Save Race Customer", email: `save-race-${crypto.randomUUID()}@example.test`,
    password: "profile-save-race-password", consent: true,
  } });
  expect(registration.status()).toBe(201);
  const workResponse = await page.request.post("/api/account/addresses", { headers: { origin }, data: {
    label: "Work", recipientName: "Save Race Customer", phone: "9876102345",
    addressLine: "Office 42, Test Towers", area: place.address, city: place.city,
    pincode: place.pincode, latitude: place.latitude, longitude: place.longitude,
    localityId: place.localityId, locationKind: place.kind, isDefault: true,
  } });
  expect(workResponse.status()).toBe(201);
  await page.route("**/api/locations/search?*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({
      provider: "photon", attribution: "OpenStreetMap contributors", results: [place],
    }),
  }));
  await page.goto("/profile");
  await expect(page.getByRole("article", { name: "Work address" })).toBeVisible();

  let releaseSave!: () => void, markSaveStarted!: () => void;
  const saveHeld = new Promise<void>(resolve => { releaseSave = resolve; });
  const saveStarted = new Promise<void>(resolve => { markSaveStarted = resolve; });
  await page.route("**/api/account/addresses", async route => {
    if (route.request().method() === "POST") {
      markSaveStarted();
      await saveHeld;
    }
    await route.continue();
  });

  const dialog = page.getByRole("dialog", { name: "Add a delivery address", exact: true });
  const savedLine = "Flat 302, Original Apartments", draftLine = "Flat 904, New Draft Apartments";
  try {
    await page.getByRole("button", { name: "Add address", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Search delivery location" }).fill("Kukatpally");
    await dialog.getByRole("option", { name: /Kukatpally/ }).click();
    await dialog.getByLabel("Flat / house, building and street").fill(savedLine);
    await dialog.getByLabel("Recipient mobile number").fill("9876102345");
    await dialog.getByRole("checkbox", { name: "Use as my default delivery address" }).check();
    await dialog.getByRole("checkbox", { name: /My address is in this area/ }).check();
    await dialog.getByRole("button", { name: "Save address", exact: true }).click();
    await saveStarted;
    await expect(dialog.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();

    // This newer explicit choice must survive even though the pending save creates a new default.
    await page.locator(".topbar").getByRole("button", { name: "Change delivery location" }).click();
    await page.getByRole("dialog", { name: "Where should we deliver?" }).getByRole("button", { name: /^Work/ }).click();
    await page.getByRole("button", { name: "Add address", exact: true }).click();
    await dialog.getByLabel("Flat / house, building and street").fill(draftLine);
  } finally {
    releaseSave();
  }

  // The toast is set after the old editor's POST and profile refresh finish, so these
  // assertions run after its completion callback would have dismissed the new editor.
  await expect(page.locator(".toast")).toHaveText("Address saved for next time");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Flat / house, building and street")).toHaveValue(draftLine);
  await expect(dialog.getByRole("combobox", { name: "Search delivery location" })).toHaveValue("");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".topbar").getByRole("button", { name: "Change delivery location" })).toContainText("Work");
  await expect(page.getByRole("article", { name: "Home address" })).toContainText(savedLine);
  const addresses = await (await page.request.get("/api/account/addresses")).json();
  expect(addresses.addresses).toHaveLength(2);
  expect(addresses.addresses).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "Home", addressLine: savedLine, isDefault: true }),
    expect.objectContaining({ label: "Work", addressLine: "Office 42, Test Towers", isDefault: false }),
  ]));
});
