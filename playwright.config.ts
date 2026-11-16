import { defineConfig } from "@playwright/test";

// End-to-end tests run against the production server: `npm run build`, then `next start`.
// Uses the locally installed Google Chrome, so no browser download is needed.
export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4319",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    // `next start` serves the `.next` production build, so `npm run build` must run first
    // (there is no `out/` anymore). reuseExistingServer lets a server started by hand be reused.
    command: "npx next start -p 4319",
    url: "http://localhost:4319/en/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
