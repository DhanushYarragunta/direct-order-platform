import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      process.env.CORE_INTEGRATION === "true"
        ? "tests/integration/**/*.test.ts"
        : "tests/*.test.ts",
    ],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
