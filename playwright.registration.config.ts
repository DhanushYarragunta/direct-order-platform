import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/registration-browser",
  webServer: {
    command: "node --import ./tests/fixtures/email-transport.mjs node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/api/health", reuseExistingServer: false,
    env: {
      APP_ORIGIN: "http://127.0.0.1:3001", DEMO_MODE: "false", RUN_BACKGROUND_JOBS: "false",
      EMAIL_PROVIDER: "resend", RESEND_API_KEY: "registration-browser-fixture", EMAIL_FROM: "kitchen@sender.test",
      SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "", TWILIO_AUTH_TOKEN: "", TWILIO_VERIFY_SERVICE_SID: "", TWILIO_MESSAGING_SERVICE_SID: "",
      AWS_REGION: "", AWS_PROFILE: "", AWS_ACCESS_KEY_ID: "", AWS_SECRET_ACCESS_KEY: "", AWS_SESSION_TOKEN: "", AWS_EC2_METADATA_DISABLED: "true",
      AWS_SMS_ORIGINATION_IDENTITY: "", AWS_SMS_ENTITY_ID: "", AWS_SMS_OTP_TEMPLATE_ID: "", AWS_SMS_UPDATE_TEMPLATE_ID: "",
      PAYMENT_PROVIDER: "demo", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "", RAZORPAY_WEBHOOK_SECRET: "",
      TRANSACTIONAL_EMAIL_ENABLED: "false", TRANSACTIONAL_SMS_ENABLED: "false",
    },
  },
});
