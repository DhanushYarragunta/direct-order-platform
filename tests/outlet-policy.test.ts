import { expect, it } from "vitest";
import { outletPolicySchema } from "../src/lib/outlet-policy";
const policy = { outletId: "kondapur", expectedUpdatedAt: new Date().toISOString(),
  fssai: "00000000000001", fssaiVerified: false, deliveryFeePaise: 4000,
  minDeliveryPaise: 19900, freeDeliveryAbovePaise: 59900,
  minPrepMinutes: 25, activeStations: 4, radiusKm: 5, open: true };
it("accepts demo policies but prevents a demo licence being declared checked", () => {
  expect(outletPolicySchema.safeParse(policy).success).toBe(true);
  expect(outletPolicySchema.safeParse({ ...policy, fssaiVerified: true, verificationNote: "Checked official record today" }).success).toBe(false);
});
it("requires fourteen licence digits and evidence for administrator verification", () => {
  expect(outletPolicySchema.safeParse({ ...policy, fssai: "licence pending" }).success).toBe(false);
  expect(outletPolicySchema.safeParse({ ...policy, fssai: "12345678901234", fssaiVerified: true }).success).toBe(false);
  expect(outletPolicySchema.safeParse({ ...policy, fssai: "12345678901234", fssaiVerified: true, verificationNote: "Test-only declaration for validation" }).success).toBe(true);
});
it("rejects contradictory delivery thresholds, zero capacity and extra fields", () => {
  expect(outletPolicySchema.safeParse({ ...policy, freeDeliveryAbovePaise: 100 }).success).toBe(false);
  expect(outletPolicySchema.safeParse({ ...policy, activeStations: 0 }).success).toBe(false);
  expect(outletPolicySchema.safeParse({ ...policy, deliveryFeePaise: -1 }).success).toBe(false);
  expect(outletPolicySchema.safeParse({ ...policy, role: "ADMIN" }).success).toBe(false);
});
