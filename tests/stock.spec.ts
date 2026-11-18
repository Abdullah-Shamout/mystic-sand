import crypto from "node:crypto";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { clearOrders, countSaleMoves, readLatestOrder, readVariantStock, setVariantStock } from "./db";

// Matches SANDBOX_WEBHOOK_SECRET in playwright.config.ts (webServer env).
const WEBHOOK_SECRET = "test-sandbox-webhook-secret";
const signWebhook = (body: string) => crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

// Stock is server-backed now: variants.stock is the single source of truth and settleOrder decrements
// it atomically on a captured payment. These specs drive the real sandbox purchase and read the
// outcome straight from Postgres (tests/db.ts). Run `npm run build` first — they hit the `next start`
// production server at localhost:4319. Long flows run on desktop.
//
// Note: the /checkout/result render settles the order but cannot expire the storefront's tag-cached
// catalog (revalidateTag/updateTag are not allowed during a page render — only the webhook route can),
// so the storefront's DISPLAYED stock can lag the 300s backstop after a sale. We therefore assert
// stock via the DB, not the storefront UI, and as before/after deltas (orders persist across specs).

async function signIn(page: Page) {
  const user = process.env.ADMIN_USERNAME ?? "admin";
  const pass = process.env.ADMIN_PASSWORD ?? "Test-Admin-2026!";
  await page.goto("/en/login/");
  await page.getByTestId("login-username").fill(user);
  await page.getByTestId("login-password").fill(pass);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/en\/admin(\/|$)/);
}

async function addToBag(page: Page, slug: string) {
  await page.goto(`/en/product/${slug}/`);
  await page.getByTestId("pdp-add-to-bag").click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function fillCheckout(page: Page, phone = "99123456") {
  await page.getByLabel("Full name").fill("Fatma Al-Kandari");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Email").fill("fatma@example.com"); // required at checkout now
  const area = page.getByRole("combobox", { name: "Area" });
  await area.fill("salm");
  await area.press("Enter");
  await page.getByLabel("Block").fill("10");
  await page.getByLabel("Street").fill("Baghdad Street");
  await page.getByLabel("House no.").fill("15");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
}

/** Pay from the checkout page through the hosted sandbox, landing on /checkout/result. */
async function paySandbox(page: Page, outcome: "approve" | "decline") {
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
  const label = outcome === "approve" ? "Approve payment" : "Decline payment";
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
}

/**
 * Drives a checkout to the sandbox and APPROVES the payment while leaving the order PENDING, so the
 * webhook is the only remaining settle path (exactly the state needed to prove a webhook settles on
 * its own). Returns the providerPaymentId (the sandbox `ref`).
 *
 * The trick: with the client runtime present, Next inlines the /checkout/result render into the Approve
 * server-action response, which settles the order server-side before any webhook. So we approve WITHOUT
 * JavaScript — a plain-HTML form POST whose `decide` action returns a real 303 redirect instead of an
 * inlined render. We intercept that POST and send it with maxRedirects:0: the server records the
 * CAPTURED outcome on the provider session, but we never follow the 303 to the result page, so nothing
 * settles the order. The checkout flow itself needs JS, so it runs in the main context; only the approve
 * step runs in a throwaway no-JS context.
 */
async function approveWithoutReturnVisit(page: Page, browser: Browser): Promise<string> {
  await addToBag(page, "i");
  await page.goto("/en/checkout/");
  await fillCheckout(page);
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
  const sandboxUrl = page.url();
  const providerPaymentId = new URL(sandboxUrl).searchParams.get("ref");
  expect(providerPaymentId, "sandbox ref (providerPaymentId) in the pay URL").toBeTruthy();

  const noJs = await browser.newContext({ javaScriptEnabled: false, baseURL: "http://localhost:4319" });
  try {
    const p2 = await noJs.newPage();
    let approvePosted = false;
    await p2.route(/\/sandbox\/pay\//, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch({ maxRedirects: 0 }); // hits the server: records the CAPTURED outcome, returns 303…
      approvePosted = true;
      await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" }); // …but we don't follow it
    });
    await p2.goto(sandboxUrl);
    await p2.getByRole("button", { name: "Approve payment" }).click();
    // Wait until the server has processed the Approve POST (the outcome is now set on the session).
    await expect.poll(() => approvePosted, { timeout: 10_000 }).toBe(true);
  } finally {
    await noJs.close();
  }

  // The order was approved but never settled (no result-page render ran) — it is still pending.
  expect((await readLatestOrder())?.status).toBe("pending");
  return providerPaymentId!;
}

test.describe("stock (server-backed)", () => {
  test.skip(({ isMobile }) => isMobile, "Long flows run on the desktop project");
  // Every purchase here is a real DB order; clear them so the admin "N samples" counts stay stable.
  test.afterEach(async () => {
    await clearOrders();
  });

  test("Approve decrements variants.stock; refreshing the result never decrements twice", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await paySandbox(page, "approve");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    expect((await readLatestOrder())?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);

    // Re-rendering the result page re-settles (idempotent): the order is already paid, so the guarded
    // decrement never runs again.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1); // still −1, never −2
  });

  test("a Decline leaves the order unpaid and stock unchanged", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await paySandbox(page, "decline");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/not completed/i);

    expect((await readLatestOrder())?.status).toBe("failed");
    expect(await readVariantStock("MS-I-50")).toBe(before);
  });

  test("an Apple Pay purchase decrements stock", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    // Apple Pay routes through the same confirm sheet → initiateCheckout → sandbox flow.
    await page.getByRole("radio", { name: /Apple Pay/ }).check();
    await page.getByTestId("checkout-pay").first().click();
    await page.getByTestId("applepay-confirm").click();
    await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
    await page.getByRole("button", { name: "Approve payment" }).click();
    await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    expect((await readLatestOrder())?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
  });

  test("express Apple Pay (button tap) with a blank (now-required) email focuses the email field and surfaces its error", async ({ page }) => {
    // Guards the express blank-email UX from the DIRECT button tap. (This entry keeps window.event set, so
    // React flushes trigger's state update ahead of the post-trigger microtask and even the pre-Fix-1 read
    // happened to see the email error here — the stale-snapshot case is exercised by the ?express deep-link
    // test below, which is the one that actually isolates Fix 1.)
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    // Fill every required detail VALIDLY except email — and never focus/blur email, so no onBlur
    // validation pre-populates the snapshot before the express tap. Name is valid, so "name" is NOT the
    // correct focus target: only a live read puts focus on the blank email.
    await page.getByLabel("Full name").fill("Fatma Al-Kandari");
    await page.getByLabel("Mobile number").fill("99123456");
    const area = page.getByRole("combobox", { name: "Area" });
    await area.fill("salm");
    await area.press("Enter");
    await page.getByLabel("Block").fill("10");
    await page.getByLabel("Street").fill("Baghdad Street");
    await page.getByLabel("House no.").fill("15");

    await page.getByTestId("express-applepay").click();

    // Focus lands on EMAIL (the distinguishing signal — the error summary would show email either way).
    await expect(page.getByLabel("Email")).toBeFocused();
    // The error summary explains WHY, linking to the email field, and the Apple Pay sheet stays closed.
    const summary = page.getByTestId("error-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Please enter your email");
    await expect(summary.locator('a[href="#ck-email"]')).toBeVisible();
    await expect(page.getByTestId("applepay-confirm")).toHaveCount(0);
  });

  test("express Apple Pay via the ?express=applepay deep link focuses the blank email, not Name (Fix 1)", async ({ page }) => {
    // This entry calls openExpressSheet from a setTimeout (macrotask) with no window.event, so the render
    // from trigger's state update is DEFERRED and the post-trigger microtask reads the STALE form.formState
    // snapshot — the exact case Fix 1 hardens. A live getFieldState read focuses EMAIL; the stale snapshot
    // (no email error yet) would fall back to focusing "Name".
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    await page.getByLabel("Full name").fill("Fatma Al-Kandari");
    await page.getByLabel("Mobile number").fill("99123456");
    const area = page.getByRole("combobox", { name: "Area" });
    await area.fill("salm");
    await area.press("Enter");
    await page.getByLabel("Block").fill("10");
    await page.getByLabel("Street").fill("Baghdad Street");
    await page.getByLabel("House no.").fill("15");
    await page.getByLabel("House no.").blur(); // flush the autosaved draft before navigating away

    // Re-enter checkout through the express deep link; the saved draft rehydrates (email still blank) and
    // the express sheet is requested from a timer.
    await page.goto("/en/checkout/?express=applepay");
    await expect(page.getByLabel("Full name")).toHaveValue("Fatma Al-Kandari"); // the draft survived
    await expect(page.getByLabel("Email")).toHaveValue(""); // email is genuinely blank/required

    // Focus must land on EMAIL (live read), not fall back to "Name" (stale snapshot).
    await expect(page.getByLabel("Email")).toBeFocused();
    const summary = page.getByTestId("error-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Please enter your email");
    await expect(page.getByTestId("applepay-confirm")).toHaveCount(0); // sheet stays closed
  });

  test("a sold-out item cannot be purchased — the server reprice refuses it, no order is created", async ({ page }) => {
    await setVariantStock("MS-I-50", 0);
    try {
      // The storefront catalog is cached, so the product page may still show it in stock and let it
      // into the bag — but initiateCheckout reads LIVE variants.stock (0) and refuses before any order.
      await addToBag(page, "i");
      await page.goto("/en/checkout/");
      await fillCheckout(page);
      await page.getByTestId("checkout-pay").first().click();

      await expect(page.getByText(/no longer available in the quantity you chose/i)).toBeVisible();
      await expect(page).not.toHaveURL(/\/sandbox\/pay\//);
      expect(await readLatestOrder()).toBeNull(); // the stock check runs BEFORE the order insert
      expect(await readVariantStock("MS-I-50")).toBe(0);
    } finally {
      await setVariantStock("MS-I-50", 24); // restore the seed stock for later specs
    }
  });

  test("a captured payment that can no longer be fulfilled is paid+oversold, never negative stock", async ({ page }) => {
    await setVariantStock("MS-I-50", 1);
    try {
      await addToBag(page, "i");
      await page.goto("/en/checkout/");
      await fillCheckout(page);
      // initiate passes (1 >= 1); we reach the sandbox with a pending order.
      await page.getByTestId("checkout-pay").first().click();
      await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });

      // Another sale drains the last unit before we approve: the settle-time guarded decrement now fails.
      await setVariantStock("MS-I-50", 0);
      await page.getByRole("button", { name: "Approve payment" }).click();
      await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });

      // Captured but unfulfillable → paid + oversold (we cannot un-charge), stock stays 0 (never −1),
      // and no sale move was written for the unfulfilled line.
      const order = await readLatestOrder();
      expect(order?.status).toBe("paid");
      expect(order?.oversold).toBe(true);
      expect(await readVariantStock("MS-I-50")).toBe(0);
      expect(await countSaleMoves(order!.id)).toBe(0);

      // The oversold flag must reach a HUMAN: it surfaces as a badge on the admin orders dashboard so
      // an admin can act (refund / restock). Without this the paid-but-unfulfillable order looks normal.
      await signIn(page);
      await page.goto("/en/admin/");
      const row = page.locator(`[data-testid="order-row"][data-order-id="${order!.id}"]`);
      await expect(row).toBeVisible();
      await expect(row.getByTestId("order-oversold")).toBeVisible();
    } finally {
      await setVariantStock("MS-I-50", 24);
    }
  });

  test("a provider webhook after the return URL re-settles idempotently — stock never decrements twice", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await addToBag(page, "i");
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await paySandbox(page, "approve"); // the return URL settles it first (paid, stock −1, one sale move)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");

    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
    expect(await countSaleMoves(order!.id)).toBe(1);

    // The signed webhook for the SAME payment now arrives (a real provider sends both). The route
    // authenticates it, settles again, and returns 200 — but the order is already paid, so nothing moves.
    const providerPaymentId = new URL(page.url()).searchParams.get("providerPaymentId");
    expect(providerPaymentId).toBeTruthy();
    const body = JSON.stringify({ providerPaymentId });
    const res = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "x-sandbox-signature": signWebhook(body), "content-type": "application/json" },
      data: body,
    });
    expect(res.status()).toBe(200);
    expect(await readVariantStock("MS-I-50")).toBe(before - 1); // still −1
    expect(await countSaleMoves(order!.id)).toBe(1); // still exactly one sale move

    // A forged webhook (bad signature) is rejected but still 200 (so the provider stops retrying).
    const forged = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "x-sandbox-signature": "deadbeef", "content-type": "application/json" },
      data: body,
    });
    expect(forged.status()).toBe(200);
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
  });

  test("a signed webhook ALONE settles a pending order (no return-URL visit) and decrements stock", async ({ page, browser }) => {
    const before = await readVariantStock("MS-I-50");
    const providerPaymentId = await approveWithoutReturnVisit(page, browser);
    // The order is pending and the stock is untouched — nothing has settled it yet.
    expect(await readVariantStock("MS-I-50")).toBe(before);

    // The provider's signed webhook arrives server-to-server. It must pay the order and decrement stock
    // entirely on its own — proving the webhook is a complete settle path, not just an idempotency echo.
    const body = JSON.stringify({ providerPaymentId });
    const res = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "x-sandbox-signature": signWebhook(body), "content-type": "application/json" },
      data: body,
    });
    expect(res.status()).toBe(200);

    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    expect(order?.oversold).toBe(false);
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
    expect(await countSaleMoves(order!.id)).toBe(1);
  });

  test("a forged or unsigned webhook is rejected and does NOT settle a pending order", async ({ page, browser }) => {
    const before = await readVariantStock("MS-I-50");
    const providerPaymentId = await approveWithoutReturnVisit(page, browser);
    const body = JSON.stringify({ providerPaymentId });

    // A forged signature: the body is authentic but the HMAC is wrong. Rejected (200 so the provider
    // stops retrying) and the order stays PENDING with stock untouched — no settle on a bad signature.
    const forged = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "x-sandbox-signature": "deadbeef", "content-type": "application/json" },
      data: body,
    });
    expect(forged.status()).toBe(200);
    expect((await readLatestOrder())?.status).toBe("pending");
    expect(await readVariantStock("MS-I-50")).toBe(before);

    // An UNSIGNED webhook (no signature header at all) is likewise rejected and does not settle.
    const unsigned = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "content-type": "application/json" },
      data: body,
    });
    expect(unsigned.status()).toBe(200);
    expect((await readLatestOrder())?.status).toBe("pending");
    expect(await readVariantStock("MS-I-50")).toBe(before);

    // The SAME body with a VALID signature now settles it — proving the signature was the only thing
    // standing between the (identical) payload and a settle, i.e. the rejection above was real auth.
    const signed = await page.request.post("/api/payments/sandbox/webhook/", {
      headers: { "x-sandbox-signature": signWebhook(body), "content-type": "application/json" },
      data: body,
    });
    expect(signed.status()).toBe(200);
    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
  });

  test("the admin set-value writes variants.stock and shows on the row", async ({ page }) => {
    await signIn(page);
    const original = await readVariantStock("MS-DUNE-250");
    try {
      await page.goto("/en/admin/stock/");
      const row = page.locator('[data-testid="stock-row"][data-sku="MS-DUNE-250"]');
      await expect(row).toBeVisible();
      await row.getByTestId("stock-input").fill("7");
      await row.getByTestId("stock-save").click();
      await expect(row).toHaveAttribute("data-set", "7");
      await expect(row).toHaveAttribute("data-available", "7");
      // The authoritative DB column reflects the write.
      expect(await readVariantStock("MS-DUNE-250")).toBe(7);
    } finally {
      // A stock-only change no longer flags the product "Edited", so there is no Reset button now:
      // restore the original value through the stock input (the admin action, which revalidates).
      await page.goto("/en/admin/stock/");
      const row = page.locator('[data-testid="stock-row"][data-sku="MS-DUNE-250"]');
      await expect(row).toBeVisible();
      await row.getByTestId("stock-input").fill(String(original));
      await row.getByTestId("stock-save").click();
      await expect(row).toHaveAttribute("data-set", String(original));
    }
  });

  test("the Stock page opens without console errors in English and Arabic", async ({ page }) => {
    await signIn(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    for (const url of ["/en/admin/stock/", "/ar/admin/stock/"]) {
      await page.goto(url, { waitUntil: "networkidle" });
      await expect(page.getByTestId("kpi-stock-units-value")).toBeVisible();
      await page.waitForTimeout(400);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });
});
