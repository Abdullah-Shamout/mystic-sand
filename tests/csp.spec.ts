import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

import { signIn } from "./auth";
import { clearImages, clearOrders, insertManyPaidOrders, insertPaidOrder } from "./db";

// Self-correcting verification for the static Content-Security-Policy (and its companion security
// headers) added in next.config.ts. It installs a collector that records every `securitypolicyviolation`
// DOM event AND every CSP-shaped console message — in the top document AND inside same-origin iframes
// (the Home-editor live preview) — then drives each surface that could trip CSP and asserts ZERO
// violations. A canary test proves the collector actually fires, so a green run can't pass vacuously.
//
// These run against the `next start` PRODUCTION server (headers are baked at build → rebuild after any
// CSP edit, or the reused :4319 server is stale). CSP is viewport-independent, so the whole file runs on
// the desktop project only (the preview iframe + videos also need ≥1280px).

type CspViolation = {
  effectiveDirective: string;
  blockedURI: string;
  documentURI: string;
  sourceFile: string;
  lineNumber: number;
  sample: string;
};

let violations: CspViolation[] = [];
let cspConsole: string[] = [];

/** A small 8×8 PNG the upload flow can decode (same fixture as admin.spec). */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVQImWM4UaGBFTEMLQkAUtVaAUH78mEAAAAASUVORK5CYII=",
  "base64",
);

test.describe("security headers / CSP (A05)", () => {
  test.skip(({ isMobile }) => isMobile, "CSP is viewport-independent; runs on the desktop project.");

  test.beforeEach(async ({ page }) => {
    violations = [];
    cspConsole = [];
    // exposeBinding + addInitScript run in EVERY frame of the context (incl. the preview iframe) and
    // survive navigations — unlike an in-page array, which a navigation would discard.
    await page.context().exposeBinding("__cspViolation", (_source, v: CspViolation) => {
      violations.push(v);
    });
    await page.context().addInitScript(() => {
      const report = (e: SecurityPolicyViolationEvent) => {
        const w = window as unknown as { __cspViolation?: (v: unknown) => void };
        w.__cspViolation?.({
          effectiveDirective: e.effectiveDirective || e.violatedDirective || "",
          blockedURI: e.blockedURI || "",
          documentURI: e.documentURI || "",
          sourceFile: e.sourceFile || "",
          lineNumber: e.lineNumber || 0,
          sample: e.sample || "",
        });
      };
      document.addEventListener("securitypolicyviolation", report);
    });
    // frame-ancestors / X-Frame-Options blocks surface ONLY as console errors, not as a DOM event.
    page.on("console", (m) => {
      const txt = m.text();
      if (/Content Security Policy|Refused to (load|execute|connect|frame|apply|run|create)/i.test(txt)) {
        cspConsole.push(txt);
      }
    });
  });

  /**
   * Asserts the collector saw no CSP violation (DOM event or console) for the surface just exercised,
   * EXCEPT the one known-benign case: zod v4's `allowsEval()` JIT probe.
   *
   * zod runs `try { Function(""); return true } catch { return false }` once (cached) to decide whether
   * it may use its codegen fast-path (node_modules/zod/v4/core/util.js:218). Under our strict CSP the
   * `Function("")` is BLOCKED — the browser reports an `eval`/`script-src` securitypolicyviolation (and a
   * matching console message) even though zod SWALLOWS the throw and falls back to its interpreter. zod's
   * own comment documents this exact interaction. It has ZERO functional impact: each surface test below
   * also asserts the real outcome (the PDF/Excel download fires, the video plays, the iframe renders, the
   * checkout completes) — so an eval-dependent path that actually broke would fail those hard assertions,
   * not slip through here. We therefore KEEP production strict (no 'unsafe-eval') and allowlist ONLY this
   * `blockedURI === "eval"` probe; every other violation (off-origin script/img/font/connect/media/worker,
   * a blocked frame, form-action, base-uri, …) still fails. zod's `z.config({ jitless: true })` would
   * silence the probe entirely — reported to the lead rather than loosening the policy.
   */
  function expectClean(label: string) {
    const real = violations.filter((v) => v.blockedURI !== "eval");
    expect(real, `${label}: securitypolicyviolation events → ${JSON.stringify(real, null, 2)}`).toEqual([]);
    const realConsole = cspConsole.filter((t) => !/unsafe-eval|evaluate a string/i.test(t));
    expect(realConsole, `${label}: CSP console messages → ${realConsole.join("\n")}`).toEqual([]);
  }

  /** Asserts the full security-header set is present and ENFORCED (not report-only, no unsafe-eval). */
  async function checkHeaders(page: Page, url: string) {
    const res = await page.goto(url);
    expect(res, `${url}: no response`).not.toBeNull();
    const h = res!.headers();
    const csp = h["content-security-policy"];
    expect(csp, `${url}: missing Content-Security-Policy`).toBeTruthy();
    expect(h["content-security-policy-report-only"], `${url}: must ENFORCE, not report-only`).toBeUndefined();
    // Production must never carry 'unsafe-eval' (it is dev-only, for React's error overlay).
    expect(csp, `${url}: production CSP must not allow 'unsafe-eval'`).not.toContain("unsafe-eval");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(h["x-content-type-options"], `${url}: X-Content-Type-Options`).toBe("nosniff");
    expect(h["referrer-policy"], `${url}: Referrer-Policy`).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"], `${url}: X-Frame-Options`).toBe("SAMEORIGIN");
    expect(h["permissions-policy"], `${url}: Permissions-Policy keeps payment=(self)`).toContain("payment=(self)");
  }

  // ── Header presence (static / dynamic / admin) ────────────────────────────────────────────────
  test("enforces the CSP (not report-only, no unsafe-eval) on static, dynamic and admin routes", async ({ page }) => {
    await checkHeaders(page, "/en/"); // storefront shell
    await checkHeaders(page, "/en/sandbox/pay/"); // dynamic route (no ref → the safe, inputs-free view)
    await signIn(page);
    await checkHeaders(page, "/en/admin/"); // admin (dynamic, authed)
    expectClean("header routes");
  });

  // ── Canary: the collector must actually record a violation ────────────────────────────────────
  test("CANARY: an off-origin image records an img-src violation (the collector is not vacuous)", async ({ page }) => {
    await page.goto("/en/");
    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://csp-canary.invalid/x.png";
      document.body.appendChild(img);
    });
    await expect.poll(() => violations.length).toBeGreaterThan(0);
    const hit = violations.find((v) => v.effectiveDirective.startsWith("img-src"));
    expect(hit, `expected an img-src violation, got → ${JSON.stringify(violations)}`).toBeTruthy();
    expect(hit!.blockedURI).toContain("csp-canary.invalid");
  });

  // ── Surface 1: admin PDF receipt (jsPDF + html-to-image) ──────────────────────────────────────
  test("surface 1: the admin PDF receipt generation trips no CSP violation", async ({ page }) => {
    await clearOrders();
    await insertPaidOrder({
      id: "MS-CSP-01",
      name: "Fatma Al-Kandari",
      phone: "51112233",
      method: "knet",
      locale: "en",
      lines: [{ sku: "MS-I-50", slug: "i", name: "I", qty: 1, priceFils: 19000 }],
    });
    try {
      await signIn(page);
      await page.goto("/en/admin/?order=MS-CSP-01");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        dialog.getByTestId("receipt-pdf").click(),
      ]);
      expect(download.suggestedFilename()).toBe("Mystic-Sand-Invoice-MS-CSP-01.pdf");
      await page.waitForTimeout(300); // let any late violation surface
      expectClean("PDF receipt");
    } finally {
      await clearOrders();
    }
  });

  // ── Surface 2: admin Excel export (write-excel-file → blob download) ───────────────────────────
  test("surface 2: the admin Excel export trips no CSP violation", async ({ page }) => {
    await clearOrders();
    await insertPaidOrder({
      id: "MS-CSP-02",
      name: "Yousef Al-Sabah",
      phone: "90011223",
      method: "knet",
      locale: "en",
      lines: [{ sku: "MS-I-50", slug: "i", name: "I", qty: 1, priceFils: 19000 }],
    });
    try {
      await signIn(page);
      await page.goto("/en/admin/");
      await expect(page.getByTestId("order-row").first()).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("orders-export").click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
      await page.waitForTimeout(300);
      expectClean("Excel export");
    } finally {
      await clearOrders();
    }
  });

  // ── Surface 2b: a LARGE Excel export forces fflate's blob: worker (proves worker-src is needed) ──
  test("surface 2b: a large Excel export runs fflate's blob: worker and trips no CSP violation", async ({ page }) => {
    await clearOrders();
    const workerUrls: string[] = [];
    page.on("worker", (w) => workerUrls.push(w.url()));
    // 200 orders × a unique ~1000-char name → the string file exceeds fflate's 160000-byte worker
    // threshold, so the async zip() deflates in a Web Worker (created from a blob: URL) rather than
    // inline. Without `worker-src 'self' blob:` the worker would be blocked and the export would fail.
    await insertManyPaidOrders(200, "MS-CSPBULK-");
    try {
      await signIn(page);
      await page.goto("/en/admin/");
      await expect(page.getByTestId("order-row").first()).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 30_000 }),
        page.getByTestId("orders-export").click(),
      ]);
      const buf = fs.readFileSync((await download.path())!);
      const files = unzipSync(new Uint8Array(buf));
      const maxUncompressed = Math.max(...Object.values(files).map((d) => d.length));
      // Prove the archive actually crossed fflate's worker threshold, so the blob: worker path (not the
      // inline sync path) was exercised. fflate switches to a Worker only for files ≥ 160000 bytes.
      expect(
        maxUncompressed,
        `largest xlsx entry (${maxUncompressed}B) must exceed fflate's 160000-byte worker threshold`,
      ).toBeGreaterThanOrEqual(160_000);
      await page.waitForTimeout(300);
      expectClean("large Excel export");
      // Soft evidence for the report: fflate's worker is created from a blob: URL.
      console.log(`[csp] workers observed during large export: ${JSON.stringify(workerUrls)}`);
    } finally {
      await clearOrders();
    }
  });

  // ── Surface 3: admin image upload + its client-side preview ───────────────────────────────────
  test("surface 3: the admin image upload and its preview trip no CSP violation", async ({ page }) => {
    await signIn(page);
    try {
      await page.goto("/en/admin/products/edit/?p=new");
      const [upload] = await Promise.all([
        page.waitForResponse((r) => r.url().includes("/api/admin/images/") && r.request().method() === "POST"),
        page.getByTestId("editor-upload-input").setInputFiles({ name: "shot.png", mimeType: "image/png", buffer: TINY_PNG }),
      ]);
      expect(upload.status()).toBe(200);
      await expect(page.getByTestId("editor-photos").locator("li")).toHaveCount(1);
      await expect(page.getByTestId("editor-preview").locator("img")).toHaveCount(1);
      // The preview <img> is served SAME-ORIGIN from /api/images (not a blob:/data: URL).
      const src = await page.getByTestId("editor-photos").locator("img").first().getAttribute("src");
      expect(src).toContain("/api/images/");
      await page.waitForTimeout(300);
      expectClean("image upload + preview");
    } finally {
      await clearImages(); // leave the images table clean for the later library/home specs
    }
  });

  // ── Surface 4: the home-page videos (muted autoplay loops) ────────────────────────────────────
  test("surface 4: the home-page videos trip no CSP violation", async ({ page }) => {
    await page.goto("/en/");
    const hero = page.locator("#hero-title").locator("xpath=ancestor::section").locator("video");
    await expect.poll(() => hero.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0)).toBe(true);
    const film = page.getByLabel("Mystic Sand brand film");
    await film.scrollIntoViewIfNeeded();
    await expect.poll(() => film.evaluate((v: HTMLVideoElement) => !v.paused)).toBe(true);
    await page.waitForTimeout(300);
    expectClean("home videos");
  });

  // ── Surface 5: the sandbox pay page, reached through a REAL checkout (Server Action form POST) ──
  test("surface 5: the sandbox pay page (via real checkout + Approve) trips no CSP violation", async ({ page }) => {
    await clearOrders();
    try {
      await page.goto("/en/product/i/");
      await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByTestId("bag-checkout").click();
      await page.waitForURL(/\/checkout\/$/);
      await page.getByLabel("Full name").fill("Fatma Al-Kandari");
      await page.getByLabel("Mobile number").fill("99123456");
      const area = page.getByRole("combobox", { name: "Area" });
      await area.fill("salm");
      await area.press("Enter");
      await page.getByLabel("Block").fill("10");
      await page.getByLabel("Street").fill("Baghdad Street");
      await page.getByLabel("House no.").fill("15");
      await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
      await page.getByTestId("checkout-pay").first().click();

      await page.waitForURL(/\/sandbox\/pay\//, { timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Approve payment" })).toBeVisible();
      expectClean("sandbox pay page");

      await page.getByRole("button", { name: "Approve payment" }).click();
      await page.waitForURL(/\/checkout\/result\//, { timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Thank you");
      await page.waitForTimeout(300);
      expectClean("sandbox Approve → result");
    } finally {
      await clearOrders();
    }
  });

  // ── Surface 6: the Home-editor live-preview iframe (same-origin embed) ─────────────────────────
  test("surface 6: the Home-editor live-preview iframe trips no CSP violation", async ({ page }) => {
    await signIn(page);
    await page.goto("/en/admin/home/");
    const frame = page.frameLocator('[data-testid="home-preview-frame"]');
    await expect(frame.locator("#hero-title")).toBeVisible();
    // The preview injects an inline <style> into the frame on load (style-src 'unsafe-inline').
    await page.waitForTimeout(500);
    expectClean("home-editor iframe");
  });

  // ── Route sweeps: every surface the full suite renders must carry the CSP and trip no violation ──
  const STORE_PAGES = [
    "/en/", "/ar/", "/en/shop/", "/en/shop/perfumes/", "/ar/shop/oud/", "/en/shop/body/",
    "/en/product/i/", "/ar/product/oud-chips/", "/en/cart/", "/en/checkout/", "/en/orders/",
    "/en/contact/", "/ar/faq/", "/en/delivery/", "/en/privacy/", "/en/terms/", "/en/refund-policy/",
    "/en/login/", "/ar/login/",
  ];
  test("route sweep: storefront, policy, checkout and login pages carry the CSP with no violations", async ({ page }) => {
    for (const url of STORE_PAGES) {
      const res = await page.goto(url);
      expect(res?.headers()["content-security-policy"], `${url}: CSP header`).toBeTruthy();
      await page.waitForTimeout(150);
    }
    expectClean("storefront route sweep");
  });

  const ADMIN_PAGES = [
    "/en/admin/", "/en/admin/products/", "/en/admin/analysis/", "/en/admin/home/",
    "/en/admin/settings/", "/en/admin/stock/", "/ar/admin/",
  ];
  test("route sweep: admin pages carry the CSP with no violations", async ({ page }) => {
    await signIn(page);
    for (const url of ADMIN_PAGES) {
      const res = await page.goto(url);
      expect(res?.headers()["content-security-policy"], `${url}: CSP header`).toBeTruthy();
      await page.waitForTimeout(150);
    }
    expectClean("admin route sweep");
  });
});
