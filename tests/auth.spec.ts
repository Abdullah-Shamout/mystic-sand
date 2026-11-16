import { expect, test } from "@playwright/test";

import { ADMIN_USERNAME, signIn } from "./auth";

// Phase 4: real admin authentication — argon2 password + a DB-backed, httpOnly session cookie,
// replacing the old browser-only gate. The admin area is gated server-side (the admin layout +
// requireAdmin()); the proxy adds an optimistic redirect. globalSetup seeds the admin.
test.describe("admin authentication", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  test("an unauthenticated visit to the admin is redirected to the login page", async ({ page }) => {
    await page.goto("/en/admin/");
    await expect(page).toHaveURL(/\/en\/login/);
    await expect(page.getByTestId("login-submit")).toBeVisible();
  });

  test("a wrong password shows a generic error and grants no access", async ({ page }) => {
    await page.goto("/en/login/");
    await page.getByTestId("login-username").fill(ADMIN_USERNAME);
    await page.getByTestId("login-password").fill("not-the-password");
    await page.getByTestId("login-submit").click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);

    // Still gated after a failed attempt.
    await page.goto("/en/admin/");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("the correct password signs in, and logout gates the admin again", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/en\/admin(\/|$)/);

    // The storefront header entry now reads "Admin" (a link), not "Enter".
    await page.goto("/en/");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();

    // Log out → the admin is gated again.
    await page.goto("/en/admin/");
    await page.getByTestId("admin-logout").click();
    await page.waitForURL(/\/en\/login/);
    await page.goto("/en/admin/");
    await expect(page).toHaveURL(/\/en\/login/);
  });
});
