import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "tests/performance",
  timeout: 180000,
  retries: 0,
  outputDir: "test-results/performance",
  reporter: [["list"]],
});
