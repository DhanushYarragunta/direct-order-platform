import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3001";

test("admin edits outlet policies with checked licence safeguards and live checkout fees", async ({ page, browser }) => {
  expect((await page.request.patch("/api/admin/outlets", { headers: { origin }, data: {} })).status()).toBe(401);
  expect((await page.request.post("/api/auth/demo", { headers: { origin }, data: { account: "admin" } })).ok()).toBeTruthy();
  const original = (await (await page.request.get("/api/admin/outlets")).json()).outlets.find((outlet: { id: string }) => outlet.id === "kondapur");
  const fields = Object.fromEntries(["fssai", "fssaiVerified", "deliveryFeePaise", "minDeliveryPaise", "freeDeliveryAbovePaise", "minPrepMinutes", "activeStations", "radiusKm", "open"].map((key) => [key, original[key]]));
  const policy = { ...fields, outletId: original.id, expectedUpdatedAt: original.updatedAt };
  expect((await page.request.patch("/api/admin/outlets", { headers: { origin: "https://untrusted.example" }, data: policy })).status()).toBe(403);
  expect((await page.request.patch("/api/admin/outlets", { headers: { origin }, data: { ...policy, fssai: "00000000000001", fssaiVerified: true, verificationNote: "Invalid demo number declaration" } })).status()).toBe(400);
  const customer = await browser.newContext({ baseURL: origin });
  try {
    expect((await customer.request.post("/api/auth/demo", { headers: { origin }, data: { account: "customer" } })).ok()).toBeTruthy();
    expect((await customer.request.patch("/api/admin/outlets", { headers: { origin }, data: policy })).status()).toBe(403);
    await page.goto("/workspace/menu");
    await page.getByRole("button", { name: "Edit Kondapur settings", exact: true }).click();
    await page.getByLabel("Delivery fee (₹, incl. GST)", { exact: true }).fill("50");
    await page.getByRole("button", { name: "Save outlet settings", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const quote = await customer.request.post("/api/checkout/quote", { headers: { origin }, data: {
      outletId: "kondapur", fulfillment: "delivery", localityId: "kondapur",
      lines: [{ itemId: "chicken-biryani", quantity: 1, portion: "regular", addOnIds: [] }],
    } });
    expect(quote.ok()).toBeTruthy();
    expect((await quote.json()).deliveryFeePaise).toBe(5000);
    expect((await page.request.patch("/api/admin/outlets", { headers: { origin }, data: policy })).status()).toBe(409);
  } finally {
    const latest = (await (await page.request.get("/api/admin/outlets")).json()).outlets.find((outlet: { id: string }) => outlet.id === original.id);
    expect((await page.request.patch("/api/admin/outlets", { headers: { origin }, data: {
      ...fields, outletId: original.id, expectedUpdatedAt: latest.updatedAt,
      verificationNote: original.fssaiVerified ? "Restored original admin declaration during test cleanup" : "",
    } })).ok()).toBeTruthy();
    await customer.close();
  }
});
