import { expect, type Page } from "@playwright/test";

// Real admin login for the test suite. Phase 4 replaced the browser-only gate with argon2 + a
// DB session cookie, so specs sign in through the actual /login flow. globalSetup seeds this admin
// (scripts/seed.ts), defaulting to the same credentials used here.
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME ?? "admin";
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Test-Admin-2026!";

/** Signs in through the real /login flow and waits until the admin shell is shown. */
export async function signIn(page: Page, locale: "en" | "ar" = "en"): Promise<void> {
  await page.goto(`/${locale}/login/`);
  await page.getByTestId("login-username").fill(ADMIN_USERNAME);
  await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(new RegExp(`/${locale}/admin(/|$)`));
  await expect(page.getByTestId("admin-logout")).toBeVisible();
}
