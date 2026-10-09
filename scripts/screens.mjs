// Screenshot sweep for visual review (uses the locally installed Chrome).
// Usage:
//   node scripts/screens.mjs --base http://localhost:4318 --out ./shots \
//     --pages /en/,/ar/ --viewports 1440x900,390x844 [--bag i,aura] [--click "[data-testid=bag-button]"] [--full]
//   Add --admin to inject a signed-in admin session (sessionStorage "ms-admin-session")
//   so the /admin pages render instead of the sign-in form, e.g.:
//     node scripts/screens.mjs --admin --pages /en/admin/,/ar/admin/
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "true"]);
    return acc;
  }, []),
);

const base = args.base ?? "http://localhost:4318";
const out = path.resolve(args.out ?? "shots");
const pages = (args.pages ?? "/en/").split(",");
const viewports = (args.viewports ?? "1440x900,390x844").split(",").map((v) => v.split("x").map(Number));
const bag = args.bag ? args.bag.split(",") : [];
const full = args.full === "true";
const admin = args.admin === "true";
const wait = Number(args.wait ?? 900);

const skus = { i: "MS-I-50", ii: "MS-II-50", iii: "MS-III-50", aura: "MS-AURA-100", cafe: "MS-CAFE-30", oud: "MS-OUD-30", oasis: "MS-OASIS-250", chips: "MS-OUDCHIPS-1T" };

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });

for (const [width, height] of viewports) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (bag.length) {
    const lines = bag.map((k) => ({ sku: skus[k] ?? k, qty: 1 }));
    await context.addInitScript((value) => {
      localStorage.setItem("ms-bag", JSON.stringify({ state: { lines: value, promo: null }, version: 2 }));
    }, lines);
  }
  if (admin) {
    // Inject a signed-in admin session so the /admin screens render for capture.
    await context.addInitScript((exp) => {
      try {
        sessionStorage.setItem("ms-admin-session", JSON.stringify({ u: "admin", exp }));
      } catch {
        // storage blocked
      }
    }, Date.now() + 60 * 60 * 1000);
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
  page.on("console", (m) => m.type() === "error" && console.log(`  [console] ${m.text()}`));
  for (const p of pages) {
    const url = new URL(p, base).toString();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(wait);
    if (full) {
      // Trigger scroll reveals and lazy images before a full-page capture.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);
    }
    if (args.click) {
      await page.locator(args.click).first().click();
      await page.waitForTimeout(700);
    }
    const name = `${p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}-${width}x${height}${args.tag ? `-${args.tag}` : ""}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: full });
    console.log(`✓ ${name}`);
  }
  await context.close();
}

await browser.close();
