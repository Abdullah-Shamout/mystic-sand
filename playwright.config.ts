import { defineConfig } from "@playwright/test";

// End-to-end tests run against the production server: `npm run build`, then `next start`.
// Uses the locally installed Google Chrome, so no browser download is needed.
//
// The storefront now reads catalog / settings / home from Postgres at request time, so the run
// needs a database: globalSetup migrates + seeds it, and DATABASE_URL must be set in the
// environment (CI service container or the local dev DB). `next start` inherits that DATABASE_URL.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // Serial: the whole suite shares ONE `next start` + Postgres. admin.spec mutates the settings
  // singleton (e.g. the delivery fee → 1500, held live across a ~20s reload-until-pass loop, plus
  // whatsapp/phone) and updateTag purges the cache process-wide, while e2e.spec asserts the DEFAULT
  // fee / delivery / footer with no tolerance — under parallel workers that is a cross-file flake, not
  // a product bug. Phase 8 adds per-worker DB isolation to restore parallelism.
  workers: 1,
  reporter: [["list"]],
  // Migrate + seed the test DB before the run (requires DATABASE_URL).
  globalSetup: "./tests/global-setup.ts",
  use: {
    baseURL: "http://localhost:4319",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    // `next start` serves the `.next` production build, so `npm run build` must run first
    // (there is no `out/` anymore). reuseExistingServer lets a server started by hand be reused.
    command: "npx next start -p 4319",
    // Readiness probe: "/" is a DB-free locale redirect (proxy.ts). Playwright starts the webServer
    // BEFORE globalSetup, so the probe must not depend on a migrated DB — every /[locale] route does.
    url: "http://localhost:4319/",
    reuseExistingServer: true,
    timeout: 120_000,
    // DATABASE_URL is inherited from the Playwright process env; APP_ENV marks the sandbox-safe env.
    // PAYMENT_PROVIDER + PAYMENT_SANDBOX_OK let `next start` boot under the instrumentation payment
    // assertion (src/instrumentation.ts): sandbox only boots in a sandbox-safe env with the opt-in.
    // Uploaded test images go to a throwaway dir under test-results (gitignored), not the repo root.
    env: {
      APP_ENV: "test",
      PAYMENT_PROVIDER: "sandbox",
      PAYMENT_SANDBOX_OK: "true",
      UPLOADS_DIR: "test-results/uploads",
    },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
