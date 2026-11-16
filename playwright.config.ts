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
  workers: 2,
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
    env: { APP_ENV: "test" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
