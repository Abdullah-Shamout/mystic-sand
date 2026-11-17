import { expect, test, type Page } from "@playwright/test";

import {
  backdateOrder,
  clearOrders,
  countSaleMoves,
  insertMismatchAttempt,
  readLatestOrder,
  readOrder,
  readVariantStock,
  resetOrderToPendingUnsettled,
  setVariantStock,
} from "./db";

// Stale-pending reconcile (src/server/orders/reconcile.ts + /api/orders/reconcile/). The route is
// secret-gated; playwright.config sets RECONCILE_SECRET on the webServer. Desktop only: the whole
// suite shares ONE `next start` process (and its in-memory sandbox sessions), so running these under
// both projects would double up against the same server state.

const RECONCILE_URL = "/api/orders/reconcile/";
const SECRET = "test-reconcile-secret";

async function fillCheckout(page: Page, phone = "99123456") {
  await page.getByLabel("Full name").fill("Reconcile Tester");
  await page.getByLabel("Mobile number").fill(phone);
  const area = page.getByRole("combobox", { name: "Area" });
  await area.fill("salm");
  await area.press("Enter");
  await page.getByLabel("Block").fill("10");
  await page.getByLabel("Street").fill("Baghdad Street");
  await page.getByLabel("House no.").fill("15");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
}

/** Drive add-to-bag → checkout → the hosted sandbox page, but choose NO outcome. Returns the sandbox
 * `ref` and leaves a fresh PENDING order (with a live provider session) in the DB. */
async function reachSandbox(page: Page, slug: string): Promise<string> {
  await page.goto(`/en/product/${slug}/`);
  await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goto("/en/checkout/");
  await fillCheckout(page);
  await page.getByTestId("checkout-pay").first().click();
  await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
  return new URL(page.url()).searchParams.get("ref")!;
}

async function postReconcile(page: Page, olderThanMinutes: number, secret = SECRET) {
  return page.request.post(RECONCILE_URL, {
    headers: { "x-reconcile-secret": secret },
    data: { olderThanMinutes },
  });
}

test.describe("stale-pending reconcile", () => {
  test.skip(({ isMobile }) => isMobile, "Reconcile specs run on the desktop project (shared server store)");
  // Start each test from an empty orders table so the summary counts reflect only this test's order.
  test.beforeEach(async () => {
    await clearOrders();
  });
  test.afterEach(async () => {
    await clearOrders();
  });

  test("an abandoned pending order (no outcome chosen) is canceled, stock unchanged", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await reachSandbox(page, "i"); // pending order; session has no outcome
    const order = await readLatestOrder();
    expect(order?.status).toBe("pending");
    await backdateOrder(order!.id, 120); // past the 60-min cutoff

    const res = await postReconcile(page, 60);
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ settled: 0, canceled: 1, skipped: 0 });

    expect((await readOrder(order!.id))?.status).toBe("canceled");
    expect(await readVariantStock("MS-I-50")).toBe(before); // never decremented
  });

  test("a pending order that already has a payment attempt is skipped, never canceled", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await reachSandbox(page, "i");
    const order = await readLatestOrder();
    expect(order?.status).toBe("pending");
    const id = order!.id;
    await insertMismatchAttempt(id); // durable evidence of a (possibly captured) payment
    await backdateOrder(id, 120);

    const res = await postReconcile(page, 60);
    // A still-pending order with a payment_attempts row needs a human — reconcile must not cancel it.
    expect(await res.json()).toEqual({ settled: 0, canceled: 0, skipped: 1 });

    expect((await readOrder(id))?.status).toBe("pending");
    expect(await readVariantStock("MS-I-50")).toBe(before);
  });

  test("a young pending order survives a tiny cutoff — the gateway session floor overrides it", async ({ page }) => {
    // Regression for the latent cancel-a-live-order bug: a 1-minute cutoff must be floored to the
    // provider's session lifetime (+ margin), so an order younger than that stays pending even though
    // the shopper may still be mid-payment (verify returns null meanwhile).
    await reachSandbox(page, "i");
    const order = await readLatestOrder();
    expect(order?.status).toBe("pending");
    const id = order!.id;
    await backdateOrder(id, 20); // ~20 min old — inside the 30-min session TTL + 5-min margin

    const res = await postReconcile(page, 1); // floored to the gateway session lifetime, not 1 min
    expect(await res.json()).toEqual({ settled: 0, canceled: 0, skipped: 0 });
    expect((await readOrder(id))?.status).toBe("pending");
  });

  test("a fresh pending order is untouched with a 60-minute cutoff", async ({ page }) => {
    const before = await readVariantStock("MS-I-50");
    await reachSandbox(page, "i");
    const order = await readLatestOrder();
    expect(order?.status).toBe("pending");
    // NOT backdated — it is younger than the cutoff.

    const res = await postReconcile(page, 60);
    expect(await res.json()).toEqual({ settled: 0, canceled: 0, skipped: 0 });

    expect((await readOrder(order!.id))?.status).toBe("pending");
    expect(await readVariantStock("MS-I-50")).toBe(before);
  });

  test("an approved order whose settle never completed is recovered to paid by reconcile, stock decremented exactly once", async ({ page }) => {
    // NOTE on technique: the brief's "approve, then abort /checkout/result before settle" approach is
    // infeasible in this app — the sandbox `decide` action's redirect() RENDERS /checkout/result within
    // the SAME action request (settling server-side), with OR without client JS, so no client-side
    // abort can leave the order un-settled. Instead we approve normally (which captures the payment:
    // the provider session's outcome becomes CAPTURED), then rewind ONLY our DB to the pre-settle state.
    // This models a real captured-but-never-persisted order: a DECIDED sandbox session is retained for
    // 24h BY DESIGN (far past the reconcile floor), so reconcile's settle re-verifies it and recovers
    // the order. It exercises the real reconcile → settleOrder → gateway.verify → stock path.
    const before = await readVariantStock("MS-I-50");
    await page.goto("/en/product/i/");
    await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goto("/en/checkout/");
    await fillCheckout(page);
    await page.getByTestId("checkout-pay").first().click();
    await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
    await page.getByRole("button", { name: "Approve payment" }).click();
    await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
    const order = await readLatestOrder();
    expect(order?.status).toBe("paid");
    const id = order!.id;
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);

    // Rewind the DB to "pending, nothing settled"; the live CAPTURED session remains in server memory.
    await setVariantStock("MS-I-50", before);
    await resetOrderToPendingUnsettled(id);
    await backdateOrder(id, 120);

    const res = await postReconcile(page, 60);
    expect(await res.json()).toEqual({ settled: 1, canceled: 0, skipped: 0 });

    // Reconcile's settle recovered the live captured session: paid, stock down exactly one, one move.
    expect((await readOrder(id))?.status).toBe("paid");
    expect(await readVariantStock("MS-I-50")).toBe(before - 1);
    expect(await countSaleMoves(id)).toBe(1);
  });

  test("the route fails closed on a missing or wrong secret", async ({ page }) => {
    const missing = await page.request.post(RECONCILE_URL, { data: {} });
    expect(missing.status()).toBe(401);
    const wrong = await page.request.post(RECONCILE_URL, {
      headers: { "x-reconcile-secret": "not-the-secret" },
      data: {},
    });
    expect(wrong.status()).toBe(401);
  });
});
