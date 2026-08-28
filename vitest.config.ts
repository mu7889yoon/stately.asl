import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 2,
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/index.ts", "src/types.ts"],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 80,
        lines: 80,
        branches: 75,
        functions: 85,
      },
    },
  },
});
