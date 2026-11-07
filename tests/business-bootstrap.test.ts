import { describe, expect, it } from "vitest";
import { assertTestBootstrapEnvironment, businessBundleSchema, loadBusinessBundle } from "../scripts/business-bootstrap";

describe("business-only test bootstrap approval", () => {
  const { bundle, sha256 } = loadBusinessBundle();
  const env = { DEMO_MODE: "false", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_fixture", ALLOW_PUBLIC_TEST_PAYMENTS: "true" };
  it("contains only reviewed catalog fields with blank unverified licences and durable photos", () => {
    expect(bundle.outlets).toHaveLength(3); expect(bundle.menuItems).toHaveLength(7); expect(bundle.addOns).toHaveLength(2); expect(bundle.availability).toHaveLength(21);
    expect(bundle.outlets.every(row => row.fssai === "" && row.fssaiVerified === false)).toBe(true);
    expect(sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(businessBundleSchema.safeParse({ ...bundle, users: [] }).success).toBe(false);
    expect(businessBundleSchema.safeParse({ ...bundle, outlets: bundle.outlets.map(row => ({ ...row, passwordHash: "forbidden" })) }).success).toBe(false);
    expect(businessBundleSchema.safeParse({ ...bundle, outlets: bundle.outlets.map(row => ({ ...row, fssaiVerified: true })) }).success).toBe(false);
    expect(businessBundleSchema.safeParse({ ...bundle, availability: [{ outletId: "unlisted", itemId: bundle.menuItems[0].id, available: true }] }).success).toBe(false);
  });
  it("allows read-only planning but requires explicit opt-in and checksum to write", () => {
    expect(() => assertTestBootstrapEnvironment(env, sha256, false)).not.toThrow();
    expect(() => assertTestBootstrapEnvironment(env, sha256, true)).toThrow("Apply requires");
    expect(() => assertTestBootstrapEnvironment({ ...env, BOOTSTRAP_TEST_BUSINESS_DATA: "true", BUSINESS_BOOTSTRAP_SHA256: "different" }, sha256, true)).toThrow("Apply requires");
    expect(() => assertTestBootstrapEnvironment({ ...env, BOOTSTRAP_TEST_BUSINESS_DATA: "true", BUSINESS_BOOTSTRAP_SHA256: sha256 }, sha256, true)).not.toThrow();
  });
  it.each([{ RAZORPAY_KEY_ID: "rzp_live_fixture" }, { DEMO_MODE: "true" }, { ALLOW_PUBLIC_TEST_PAYMENTS: "false" }, { PAYMENT_PROVIDER: "demo" }])
    ("rejects unsafe deployment mode %j", override => {
      expect(() => assertTestBootstrapEnvironment({ ...env, ...override, BOOTSTRAP_TEST_BUSINESS_DATA: "true", BUSINESS_BOOTSTRAP_SHA256: sha256 }, sha256, true)).toThrow("restricted");
    });
});
