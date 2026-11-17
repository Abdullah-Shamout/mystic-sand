import { expect, test, type Page } from "@playwright/test";

import { ADMIN_PASSWORD, ADMIN_USERNAME, signIn } from "./auth";
import {
  beginBlockingHashRotation,
  countLockWaiters,
  readAdminHash,
  restoreAdminHash,
  unrevokeAllSessions,
} from "./db";

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

// Phase 10 security fix: password-change session revocation is robust. changePassword rotates the hash
// + passwordChangedAt and re-mints the current session in ONE transaction, and verifySession rejects a
// session whose createdAt predates passwordChangedAt (the activated backstop). Each test restores the
// seeded credential by direct SQL in a finally so every later spec's real login still works.
test.describe("password-change session revocation", () => {
  test.skip(({ isMobile }) => isMobile, "Runs on the desktop project");

  const NEW_PASSWORD = "Rotated-Pass-7788!";

  /** Drives the admin Settings → Account password change and waits for the success signal. */
  async function changePasswordViaUi(page: Page, current: string, next: string): Promise<void> {
    await page.goto("/en/admin/settings/");
    await page.getByTestId("account-password-current").fill(current);
    await page.getByTestId("account-new").fill(next);
    await page.getByTestId("account-confirm").fill(next);
    await page.getByTestId("account-password-save").click();
    // On success the action clears the current-password field (and shows a toast) — a reliable success
    // signal independent of toast copy / locale.
    await expect(page.getByTestId("account-password-current")).toHaveValue("");
  }

  test("an old session is rejected after the change (backstop) while the changer stays signed in (re-mint)", async ({
    page,
    context,
  }) => {
    const originalHash = await readAdminHash(ADMIN_USERNAME);
    try {
      // Sign in → session S1; capture its cookie (and token value) before the change.
      await signIn(page);
      const before = (await context.cookies()).find((c) => c.name === "ms_session");
      expect(before, "a session cookie should be set after login").toBeTruthy();

      // Change the admin's OWN password from the same browser.
      await changePasswordViaUi(page, ADMIN_PASSWORD, NEW_PASSWORD);

      // Re-mint: no bounce to /login in the same roundtrip, the cookie was replaced with a fresh token,
      // and an admin page loads immediately — the changer stays signed in on the new session.
      await expect(page).toHaveURL(/\/en\/admin\/settings/);
      const after = (await context.cookies()).find((c) => c.name === "ms_session");
      expect(after, "the session cookie should still be present after the change").toBeTruthy();
      expect(after!.value, "the session cookie must be re-minted (a new token)").not.toBe(before!.value);
      await page.goto("/en/admin/");
      await expect(page.getByTestId("admin-logout")).toBeVisible();

      // Backstop in isolation: undo the explicit revoke, so S1's ONLY remaining disqualifier is that it
      // predates passwordChangedAt. Re-present S1's cookie → still unauthorized.
      await unrevokeAllSessions();
      await context.clearCookies();
      await context.addCookies([before!]);
      await page.goto("/en/admin/");
      await expect(page).toHaveURL(/\/en\/login/);
    } finally {
      // Restore the seeded credential so later specs can sign in.
      await restoreAdminHash(ADMIN_USERNAME, originalHash);
    }
    // A real login confirms the restore and clears the in-memory lockout counter for this username+IP.
    await signIn(page);
  });

  test("a login racing an in-flight password rotation is refused — no usable session", async ({
    page,
    context,
  }) => {
    // Clean slate: a prior successful login clears the failure counter; drop the cookie so the racing
    // login starts unauthenticated.
    await signIn(page);
    await context.clearCookies();

    const rotation = await beginBlockingHashRotation(ADMIN_USERNAME);
    try {
      // Begin a login with the OLD (still-committed) password. It verifies the old hash, then blocks on
      // createSession's SELECT ... FOR UPDATE against the admin row the in-flight rotation holds.
      await page.goto("/en/login/");
      await page.getByTestId("login-username").fill(ADMIN_USERNAME);
      await page.getByTestId("login-password").fill(ADMIN_PASSWORD);
      await page.getByTestId("login-submit").click();

      // Deterministic ordering (no sleeps): wait until the login backend is parked on the held lock.
      await expect.poll(() => countLockWaiters(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

      // Commit the rotation: the login's FOR UPDATE re-reads a changed hash that no longer matches what
      // it verified, so it aborts with the generic invalid result — no session row, no cookie.
      await rotation.commit();

      await expect(page.getByRole("alert")).toBeVisible();
      await expect(page).toHaveURL(/\/en\/login/);
      const sessionCookie = (await context.cookies()).find((c) => c.name === "ms_session");
      expect(sessionCookie, "no session cookie should be set after a refused login").toBeFalsy();
      await page.goto("/en/admin/");
      await expect(page).toHaveURL(/\/en\/login/);
    } finally {
      await rotation.dispose(); // no-op if already committed
      await restoreAdminHash(ADMIN_USERNAME, rotation.originalHash);
    }
    // Confirm the restore and clear the failure counter via a real login.
    await signIn(page);
  });

  test("a password change racing an in-flight rotation is refused — no silent overwrite, changer stays signed in", async ({
    page,
    context,
  }) => {
    // A prior successful login clears the failure counter and leaves a live admin session (S1).
    await signIn(page);

    const rotation = await beginBlockingHashRotation(ADMIN_USERNAME);
    try {
      // Drive the change with the correct CURRENT password. It verifies the still-committed OLD hash
      // out-of-tx, then blocks on the in-tx SELECT ... FOR UPDATE against the admin row the in-flight
      // rotation holds (the symmetric guard to login's createSession re-check).
      await page.goto("/en/admin/settings/");
      await page.getByTestId("account-password-current").fill(ADMIN_PASSWORD);
      await page.getByTestId("account-new").fill(NEW_PASSWORD);
      await page.getByTestId("account-confirm").fill(NEW_PASSWORD);
      await page.getByTestId("account-password-save").click();

      // Deterministic ordering (no sleeps): wait until the change backend is parked on the held lock.
      await expect.poll(() => countLockWaiters(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);

      // Commit the rotation: the change's FOR UPDATE re-reads a hash that no longer matches what it
      // authenticated `current` against, so it aborts with the generic error — no overwrite, no revoke.
      await rotation.commit();

      // The "current" error path: the current-password field is flagged invalid and NOT cleared (clearing
      // is the success signal), proving the change was refused.
      await expect(page.getByTestId("account-password-current")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByTestId("account-password-current")).not.toHaveValue("");

      // PROOF the UPDATE never ran: the stored hash is still the rotation's value (old hash + suffix), NOT
      // a hash of NEW_PASSWORD — the newer password was not clobbered.
      expect(await readAdminHash(ADMIN_USERNAME)).toBe(rotation.originalHash + "-rotated-by-test");

      // PROOF the revoke sweep never ran: S1 is intact, so the changer is still signed in.
      await page.goto("/en/admin/");
      await expect(page.getByTestId("admin-logout")).toBeVisible();
    } finally {
      await rotation.dispose(); // no-op if already committed
      await restoreAdminHash(ADMIN_USERNAME, rotation.originalHash);
    }
    // The changer is still signed in on S1, so /login would bounce to /admin — drop the session first,
    // then a real login confirms the restored credential works (and leaves a clean state for later specs).
    await context.clearCookies();
    await signIn(page);
  });
});
