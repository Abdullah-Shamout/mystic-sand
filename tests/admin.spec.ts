import { expect, test } from "@playwright/test";

// The admin area is a browser-only demo gate (see src/lib/admin-auth.ts). These tests cover
// the header entry, the sign-in flow, the signed-out gate and the admin-messages split.
// Run `npm run build` first — they hit the static export served at localhost:4319.

const ADMIN_USER = "admin";
const ADMIN_PASS = "MysticSand2026";

test.describe("admin header entry", () => {
  test('the header offers "Enter" in English and "دخول" in Arabic', async ({ page }) => {
    await page.goto("/en/");
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toBeVisible();

    await page.goto("/ar/");
    await expect(page.getByRole("button", { name: "دخول", exact: true })).toBeVisible();
  });

  test("the header does not overflow at 360px wide", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    for (const path of ["/en/", "/ar/"]) {
      await page.goto(path);
      await expect(page.getByRole("button", { name: /Enter|دخول/ })).toBeVisible();
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `horizontal overflow on ${path}`).toBe(false);
    }
  });
});

test.describe("admin sign-in", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("a wrong password shows a generic error", async ({ page }) => {
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await dialog.getByLabel("Password", { exact: true }).fill("not-the-password");
    await dialog.getByRole("button", { name: "Sign in" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("Wrong username or password.");
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test("correct credentials sign in, survive a reload, and log out", async ({ page }) => {
    await page.goto("/en/");
    await page.getByRole("button", { name: "Enter", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Username", { exact: true }).fill(ADMIN_USER);
    await dialog.getByLabel("Password", { exact: true }).fill(ADMIN_PASS);
    await dialog.getByRole("button", { name: "Sign in" }).click();

    // Lands in the admin area with the nav tabs.
    await page.waitForURL(/\/en\/admin\/$/);
    await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Product analysis", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();

    // The session survives a reload.
    await page.reload();
    await expect(page).toHaveURL(/\/en\/admin\/$/);
    await expect(page.getByRole("link", { name: "Orders", exact: true })).toBeVisible();

    // Back on the store the header entry now reads "Admin".
    await page.goto("/en/");
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toHaveCount(0);

    // Log out from the admin area returns to the store and restores "Enter".
    await page.getByRole("link", { name: "Admin", exact: true }).click();
    await page.waitForURL(/\/en\/admin\/$/);
    await page.getByRole("button", { name: "Log out" }).click();
    await page.waitForURL(/\/en\/$/);
    await expect(page.getByRole("button", { name: "Enter", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
  });

  test("the admin area shows the sign-in page when signed out", async ({ page }) => {
    await page.goto("/en/admin/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Admin sign in");
    // The admin content and its nav are not rendered until signed in.
    await expect(page.getByRole("link", { name: "Product analysis", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  });

  test("the storefront home does not ship admin messages", async ({ page }) => {
    const response = await page.request.get("/en/");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).not.toContain("Everything here is saved in this browser only.");
    expect(html).not.toContain("Product analysis");
  });
});
