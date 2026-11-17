import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Unit-test runner for the PURE functions in src/lib (pricing / catalog / home / settings / phone).
// Deliberately separate from the Playwright E2E suite: `include` matches only `src/**/*.test.ts`, and
// `exclude` drops `tests/**` so Playwright's `tests/*.spec.ts` are never collected here. These tests
// need NO database and NO browser — `npm run test:unit` runs them in a plain Node environment.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", ".next/**"],
    environment: "node",
  },
  resolve: {
    // Mirror tsconfig.json's `"@/*": ["./src/*"]` so `@/…` imports resolve in the unit tests. A bare
    // "@" alias only matches an id that is exactly "@" or begins "@/…", so scoped packages
    // (@playwright/test, @hookform/resolvers, …) are left untouched.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
