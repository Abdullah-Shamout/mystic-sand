import { expect, test, type Page } from "@playwright/test";

// Core shopping flows against the static export (run `npm run build` first).

const BAG_KEY = "ms-bag";

async function addFromProductPage(page: Page, slug: string) {
  await page.goto(`/en/product/${slug}/`);
  await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function fillCheckout(page: Page, phone = "٩٩١٢٣٤٥٦") {
  await page.getByLabel("Full name").fill("Fatma Al-Kandari");
  await page.getByLabel("Mobile number").fill(phone);
  const area = page.getByRole("combobox", { name: "Area" });
  await area.fill("salm");
  await area.press("Enter");
  await page.getByLabel("Block").fill("10");
  await page.getByLabel("Street").fill("Baghdad Street");
  await page.getByLabel("House no.").fill("15");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
}

async function payWithKnet(page: Page) {
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/checkout\/pay\//);
  await page.getByRole("radio", { name: /National Bank of Kuwait/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // Orders of KD 25 or more add the bank's SMS-code step.
  const smsConfirm = page.getByRole("button", { name: "Confirm", exact: true });
  if (await page.getByText(/verification code/i).isVisible().catch(() => false)) await smsConfirm.click();
  await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
}

test.describe("shopping flows", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");

  test("add to bag → checkout → KNET captured → receipt survives refresh", async ({ page }) => {
    await addFromProductPage(page, "i");
    await expect(page.getByTestId("bag-line")).toHaveCount(1);
    await page.getByTestId("bag-checkout").click();
    await page.waitForURL(/\/checkout\/$/);

    await fillCheckout(page);
    await expect(page.getByLabel("Mobile number")).toHaveValue("99123456"); // Arabic digits normalised
    await payWithKnet(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    await expect(page.getByText("CAPTURED").first()).toBeVisible();
    await expect(page.getByText(/MS-\d{5}/).first()).toBeVisible();

    // The bag was cleared exactly once; a refresh shows the same receipt.
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
  });

  test("declined payment keeps the bag and offers a retry", async ({ page }) => {
    await addFromProductPage(page, "aura");
    await page.goto("/en/checkout/");
    await page.evaluate(() => sessionStorage.setItem("ms-demo-outcome", "NOT CAPTURED"));
    await fillCheckout(page);
    await payWithKnet(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/not completed/i);
    await expect(page.getByText(/not been charged/i)).toBeVisible();
    const bag = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "{}"), BAG_KEY);
    expect(bag.state.lines).toHaveLength(1);
    await expect(page.getByRole("button", { name: /Try again/i }).or(page.getByRole("link", { name: /Try again/i }))).toBeVisible();
  });

  test("landline numbers are rejected with a clear message", async ({ page }) => {
    await addFromProductPage(page, "cafe");
    await page.goto("/en/checkout/");
    await fillCheckout(page, "22212345");
    await page.getByTestId("checkout-pay").first().click();
    await expect(page.getByText(/mobile number/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/checkout\/$/);
  });

  test("switching language keeps the page and the bag", async ({ page }) => {
    await addFromProductPage(page, "ii");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /Language/ }).first().click();
    await page.waitForURL(/\/ar\/product\/ii\/$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("bag-button").filter({ visible: true }).first()).toHaveAccessibleName(/1|قطعة واحدة/);
  });

  test("deep link to checkout with an empty bag shows the empty state", async ({ page }) => {
    await page.goto("/en/checkout/");
    await expect(page.getByText(/Your bag is empty/i).first()).toBeVisible();
  });
});

const PAGES = [
  "/en/",
  "/ar/",
  "/en/shop/",
  "/ar/shop/home/",
  "/en/product/i/",
  "/ar/product/oud-chips/",
  "/en/cart/",
  "/en/orders/",
  "/en/our-story/",
  "/ar/contact/",
  "/en/faq/",
  "/ar/terms/",
  "/en/privacy/",
  "/en/refund-policy/",
  "/ar/delivery/",
];

test.describe("pages load cleanly", () => {
  for (const path of PAGES) {
    test(`${path} renders without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(400);
      expect(errors).toEqual([]);
    });
  }
});
