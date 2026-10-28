import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // ADR-0007: la librería de dominio exige cobertura total.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
