import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/test/**/*.test.ts", "web/test/**/*.test.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["core/src/**/*.ts"],
      exclude: ["core/src/index.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 90, branches: 85 },
    },
  },
});
