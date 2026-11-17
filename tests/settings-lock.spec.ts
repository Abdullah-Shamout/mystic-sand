import { expect, test, type Page } from "@playwright/test";

import { acquireSessionAdvisoryLock, countAdvisoryLocks, readSettingsFee } from "./db";

// Phase-10 proof: the settings singleton save (saveSettings → withAdvisoryLock) acquires
// pg_advisory_xact_lock before its read→merge→upsert, so two concurrent admin saves cannot lose an
// update. This is a DETERMINISTIC serialisation proof, not a race: a SIDE connection holds the SAME
// key as a SESSION-level advisory lock, which conflicts with the action's transaction-level lock, so
// the in-flight save BLOCKS until we release — and only then does the row change.
//
// SETTINGS_LOCK is the bigint key in src/server/db/locks.ts; kept here as a number (the db.ts helpers
// bind it as a query param) and must stay in sync with that module.

const SETTINGS_LOCK = 1;

async function signIn(page: Page) {
  // Phase 4: real login (argon2 + session cookie). globalSetup seeds this admin.
  const user = process.env.ADMIN_USERNAME ?? "admin";
  const pass = process.env.ADMIN_PASSWORD ?? "Test-Admin-2026!";
  await page.goto("/en/login/");
  await page.getByTestId("login-username").fill(user);
  await page.getByTestId("login-password").fill(pass);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/en\/admin(\/|$)/);
}

test.describe("singleton RMW advisory lock (settings)", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("a held advisory lock blocks the settings save; releasing it lets the save land", async ({ page }) => {
    // Hold the settings key on a side connection BEFORE driving the save.
    const lock = await acquireSessionAdvisoryLock(SETTINGS_LOCK);
    try {
      await signIn(page);
      await page.goto("/en/admin/settings/");
      const standard = page.getByTestId("settings-standard-fee");
      await expect(standard).toHaveValue("1.000");

      // Target 2.500 KWD (2500 fils) — a value no default-data spec asserts as the landed state.
      await standard.fill("2.500");
      expect(await readSettingsFee()).not.toBe(2500); // seed (1000) or no row yet — never the target

      // Fire the save. The Server Action runs requireAdmin + the zod parse, then BLOCKS on
      // pg_advisory_xact_lock(SETTINGS_LOCK) — which we hold — before it can upsert. click() returns
      // once the click is dispatched; it does not await the (now-blocked) action.
      await page.getByTestId("settings-fee-save").click();

      // Acquisition proof: the action is provably WAITING on our key (we hold it; the save is blocked).
      await expect
        .poll(() => countAdvisoryLocks(SETTINGS_LOCK).then((c) => c.waiting), { timeout: 15_000 })
        .toBeGreaterThanOrEqual(1);
      expect((await countAdvisoryLocks(SETTINGS_LOCK)).granted).toBeGreaterThanOrEqual(1);

      // Blocking proof: while the lock is held the save cannot write — the stored fee is unchanged and
      // the UI has not confirmed.
      expect(await readSettingsFee()).not.toBe(2500);
      await expect(page.getByText("Saved.")).toHaveCount(0);

      // Release the lock → the save's transaction acquires it, upserts and commits.
      await lock.release();

      // Liveness proof: the stored fee now reflects the save (poll on the DB, process-independent).
      await expect.poll(() => readSettingsFee(), { timeout: 15_000 }).toBe(2500);
    } finally {
      await lock.release(); // idempotent — the UI reset below must not block on our own lock
      // Reset to the seed through the admin UI (saveSettings → updateTag), leaving the shared DB clean.
      // The liveness poll above already confirmed the unblocked save committed, so this cannot race it.
      await page.goto("/en/admin/settings/");
      const resetBtn = page.getByTestId("settings-standard-reset");
      if (await resetBtn.count()) {
        await resetBtn.click();
        await expect(page.getByTestId("settings-standard-fee")).toHaveValue("1.000");
      }
      await expect.poll(() => readSettingsFee(), { timeout: 15_000 }).toBe(1000);
    }
  });
});
