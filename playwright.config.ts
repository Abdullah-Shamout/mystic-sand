import { defineConfig } from "@playwright/test";

// End-to-end tests run against the static export (`npm run build` first).
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
    command: "npx serve out -l 4319 --no-clipboard",
    url: "http://localhost:4319/en/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
