import { describe, expect, it } from "vitest";
import { validateStartupConfig } from "../scripts/startup-config.mjs";

const publicConfig = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  DATABASE_URL: "postgresql://fixture.invalid/test", APP_ORIGIN: "https://staging.example.test",
  DEMO_MODE: "false", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_fixture",
  RAZORPAY_KEY_SECRET: "test-fixture-only", RAZORPAY_WEBHOOK_SECRET: "webhook-fixture-only",
  PRIVACY_CONTACT: "privacy@example.test", SUPPORT_EMAIL: "support@example.test", ...overrides,
});

describe("public provider testing startup", () => {
  it("requires explicit acknowledgement for test keys on a public origin", () => {
    for (const flag of [undefined, "false", "TRUE", "1"])
      expect(() => validateStartupConfig(publicConfig({ ALLOW_PUBLIC_TEST_PAYMENTS: flag }))).toThrow("ALLOW_PUBLIC_TEST_PAYMENTS=true");
  });

  it("allows public test checkout with real email and customer authentication", () => {
    expect(validateStartupConfig(publicConfig({ ALLOW_PUBLIC_TEST_PAYMENTS: "true",
      EMAIL_PROVIDER: "ses", TRANSACTIONAL_EMAIL_ENABLED: "true" }))).toEqual({
      origin: "https://staging.example.test", publicTestPayments: true,
    });
  });

  it("does not let the staging acknowledgement silently enable live payments", () => {
    expect(() => validateStartupConfig(publicConfig({ ALLOW_PUBLIC_TEST_PAYMENTS: "true", RAZORPAY_KEY_ID: "rzp_live_fixture" })))
      .toThrow("disable it before enabling live checkout");
    expect(validateStartupConfig(publicConfig({ ALLOW_PUBLIC_TEST_PAYMENTS: "false", RAZORPAY_KEY_ID: "rzp_live_fixture" })).publicTestPayments).toBe(false);
  });

  it.each([
    ["APP_ORIGIN", "http://staging.example.test", "HTTPS"],
    ["PRIVACY_CONTACT", " ", "PRIVACY_CONTACT"],
    ["SUPPORT_EMAIL", " ", "SUPPORT_EMAIL"],
    ["RAZORPAY_KEY_SECRET", " ", "keys and webhook"],
    ["RAZORPAY_WEBHOOK_SECRET", "", "keys and webhook"],
    ["RAZORPAY_KEY_ID", "rzp_test_", "requires Razorpay test keys"],
    ["PAYMENT_PROVIDER", "demo", "requires Razorpay test keys"],
  ])("preserves the %s startup requirement in staging", (name, value, message) => {
    expect(() => validateStartupConfig(publicConfig({ ALLOW_PUBLIC_TEST_PAYMENTS: "true", [name]: value }))).toThrow(message);
  });

  it("preserves public demo acknowledgement and rejects live keys for demo accounts", () => {
    expect(() => validateStartupConfig(publicConfig({ DEMO_MODE: "true", ALLOW_PUBLIC_TEST_PAYMENTS: "true" })))
      .toThrow("ALLOW_PUBLIC_DEMO=true");
    expect(validateStartupConfig(publicConfig({ DEMO_MODE: "true", ALLOW_PUBLIC_DEMO: "true" })).publicTestPayments).toBe(false);
    for (const origin of ["https://staging.example.test", "http://127.0.0.1:3000"])
      expect(() => validateStartupConfig(publicConfig({ APP_ORIGIN: origin, DEMO_MODE: "true", ALLOW_PUBLIC_DEMO: "true", RAZORPAY_KEY_ID: "rzp_live_fixture" })))
        .toThrow("Live payment keys cannot be used with shared demo accounts");
  });

  it("keeps loopback setup available without public launch settings", () => {
    expect(validateStartupConfig({ DATABASE_URL: "test-only", APP_ORIGIN: "http://127.0.0.1:3000", DEMO_MODE: "false" }))
      .toEqual({ origin: "http://127.0.0.1:3000", publicTestPayments: false });
  });

  it.each(["not-a-url", "https://user:private@example.test", "https://example.test/orders", "https://example.test/?secret=value", "https://example.test/#private"])
    ("rejects malformed or non-origin APP_ORIGIN values without echoing them", (origin) => {
      expect(() => validateStartupConfig(publicConfig({ APP_ORIGIN: origin, ALLOW_PUBLIC_TEST_PAYMENTS: "true" }))).toThrow("APP_ORIGIN");
      try { validateStartupConfig(publicConfig({ APP_ORIGIN: origin })); }
      catch (error) { expect((error as Error).message).not.toContain("private"); }
    });
});
