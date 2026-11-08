import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Every e2e test boots its own in-memory Postgres (PGlite, WASM). Too many at once starve each other on CPU,
    // so cap the workers and give hooks room on slow machines and CI runners.
    maxWorkers: 4,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
