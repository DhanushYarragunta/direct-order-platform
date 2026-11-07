import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/gateway-browser",
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/api/health", reuseExistingServer: false,
    env: { APP_ORIGIN: "http://127.0.0.1:3001", DEMO_MODE: "true", RUN_BACKGROUND_JOBS: "false",
      PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_browser_fixture",
      RAZORPAY_KEY_SECRET: "browser-fixture-not-a-real-secret", RAZORPAY_WEBHOOK_SECRET: "browser-fixture-webhook" },
  },
});
