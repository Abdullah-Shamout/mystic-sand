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

  test("a revoked (post-logout) session cookie is rejected on replay, not just dropped", async ({
    page,
    context,
  }) => {
    await signIn(page);
    const saved = (await context.cookies()).find((c) => c.name === "ms_session");
    expect(saved, "the session cookie should be set after login").toBeTruthy();

    // Log out: this revokes the session ROW (server-side) and clears the cookie.
    await page.goto("/en/admin/");
    await page.getByTestId("admin-logout").click();
    await page.waitForURL(/\/en\/login/);

    // Re-present the OLD cookie. Its JWT signature is still valid (so the optimistic proxy check in
    // proxy.ts passes), but verifySession() must reject it because the row is revoked — proving the
    // authoritative check is server-side, not "the cookie was merely deleted from the browser".
    await context.addCookies([saved!]);
    await page.goto("/en/admin/");
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("an unauthenticated POST to the image upload route is 401, not 500", async ({ request }) => {
    // The `request` fixture carries no browser session, so requireAdmin() must deny with a mapped 401.
    const res = await request.post("/api/admin/images/", {
      multipart: {
        profile: "packshot",
        file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      },
    });
    expect(res.status()).toBe(401);
  });
});
