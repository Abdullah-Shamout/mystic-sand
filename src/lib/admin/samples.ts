import { banks } from "@/data/banks";
import { areas } from "@/data/kuwait-areas";
import { promoCodes } from "@/data/site";
import type { Product } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { baseCatalog } from "@/lib/catalog";
import { kuwaitClock } from "@/lib/delivery";
import type { PaymentRecord } from "@/lib/payments/types";
import { bagKey, computeTotals, type BagLine, type Promo } from "@/lib/pricing";
import { defaultSettings } from "@/lib/settings";
import type { Order, OrderLine } from "@/store/checkout";
import { mulberry32 } from "./prng";

// Deterministic sample orders for the demo dashboard. Called only from an effect (never during
// render): it builds ~30 realistic Kuwaiti orders over the last six weeks, relative to `now`.
// A fixed seed means the data is stable across reloads; only the dates move with `now`.
// Storefront code must never import this module.

const SEED = 0x5a17d9;
const DAY = 24 * 60 * 60 * 1000;
const COUNT = 30;

// The fixed built-in order's id. It sits at the very top of the sample range (MS-10000..19999) and
// is reserved so the PRNG generator never draws it; real orders use MS-20000..99999, so there is no
// collision with a real checkout. Older builds placed this order at MS-20714 (inside the real range);
// those ids are migrated to FIXED_ORDER_ID by the admin store's samplesVersion top-up.
export const FIXED_ORDER_ID = "MS-19999";
export const LEGACY_FIXED_ORDER_IDS = ["MS-20714"] as const;

const NAMES_LATIN = [
  "Fatma Al-Kandari", "Yousef Al-Sabah", "Noura Al-Mutairi", "Abdullah Al-Rashidi", "Dana Al-Ajmi",
  "Mohammed Al-Azmi", "Sara Al-Enezi", "Khaled Al-Dosari", "Hessa Al-Fadhli", "Ali Al-Shammari",
  "Maryam Al-Qallaf", "Omar Al-Hajri", "Latifa Al-Failakawi", "Bader Al-Otaibi", "Shaikha Al-Roumi",
];

const NAMES_AR = [
  "فاطمة الكندري", "يوسف الصباح", "نورة المطيري", "عبدالله الرشيدي", "دانة العجمي",
  "محمد العازمي", "سارة العنزي", "خالد الدوسري", "حصة الفضلي", "علي الشمري",
  "مريم القلاف", "عمر الهاجري", "لطيفة الفيلكاوي", "بدر العتيبي", "شيخة الرومي",
];

const EMAIL_HANDLES = ["noura", "yousef", "dana", "khaled", "maryam", "ali", "hessa", "omar", "sara", "bader"];
const EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "icloud.com"];

const NAMED_STREETS = ["Baghdad Street", "Gulf Road", "Salem Al-Mubarak St", "First Ring Road", "Tunis Street", "Beirut Street"];

const NOTES_EN = [
  "Please call on arrival.",
  "Leave with the building guard.",
  "Ring the bell twice.",
  "Deliver after 5pm, please.",
  "Gift — no invoice inside, please.",
];
const NOTES_AR = [
  "الرجاء الاتصال عند الوصول.",
  "سلّمها لحارس العمارة.",
  "دقّ الجرس مرتين.",
  "التوصيل بعد الساعة 5 مساءً لو سمحت.",
  "هدية — بدون فاتورة بالداخل لو سمحت.",
];

/** Internal draft: everything needed to build a paid sample order. */
type Draft = {
  id: string;
  placed: Date;
  locale: Locale;
  lines: OrderLine[];
  bagLines: BagLine[];
  details: Order["details"];
  method: Order["method"];
  bankId: string | undefined;
  deliveryMethod: "standard";
  promo: Promo | null;
  doneRoll: number;
  doneDaysRoll: number;
};

export function generateSampleOrders(now: Date): { orders: Order[]; done: Record<string, string> } {
  const rng = mulberry32(SEED);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rng() * 10)).join("");
  const mmdd = (date: Date) => {
    const c = kuwaitClock(date);
    return `${String(c.month).padStart(2, "0")}${String(c.day).padStart(2, "0")}`;
  };

  // Kuwait "today" at midnight, labelled in UTC so day arithmetic stays on the calendar day.
  const today = kuwaitClock(now);
  const kuwaitMidnight = Date.UTC(today.year, today.month - 1, today.day);

  const baseProducts = baseCatalog.visible;
  // Reserve the fixed built-in id so a random sample never collides with it.
  const usedIds = new Set<string>([FIXED_ORDER_ID]);
  const nowMs = now.getTime();

  const drafts: Draft[] = [];
  for (let i = 0; i < COUNT; i++) {
    let id = "";
    do {
      id = `MS-${10000 + Math.floor(rng() * 10000)}`;
    } while (usedIds.has(id));
    usedIds.add(id);

    // Date: a day in the last six weeks, at a wall-clock time between 10:00 and 23:30 Kuwait.
    const daysAgo = Math.floor(rng() * 42);
    const minutes = 600 + Math.floor(rng() * 811); // 10:00 … 23:30
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const dayStart = new Date(kuwaitMidnight - daysAgo * DAY);
    let placed = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), hour - 3, minute));
    if (placed.getTime() > nowMs) placed = new Date(placed.getTime() - DAY);

    const locale: Locale = rng() < 0.45 ? "ar" : "en";
    const name = locale === "ar" ? pick(NAMES_AR) : pick(NAMES_LATIN);
    const phone = `${pick(["5", "6", "9"])}${digits(7)}`;
    const email = rng() < 0.55 ? `${pick(EMAIL_HANDLES)}${int(10, 99)}@${pick(EMAIL_DOMAINS)}` : "";

    const area = pick(areas);
    const housingRoll = rng();
    const housing: "house" | "apartment" | "office" = housingRoll < 0.5 ? "house" : housingRoll < 0.85 ? "apartment" : "office";
    const isHouse = housing === "house";
    const street = rng() < 0.5 ? `Street ${int(1, 30)}` : pick(NAMED_STREETS);

    const method: Order["method"] = (() => {
      const r = rng();
      return r < 0.55 ? "knet" : r < 0.85 ? "applepay" : "card";
    })();
    const bankId = method === "knet" ? pick(banks).id : undefined;
    // One delivery type everywhere — every sample order uses it.
    const deliveryMethod = "standard" as const;
    const promo: Promo | null = rng() < 0.15 ? { code: "SAND10", percent: promoCodes.SAND10.percent } : null;

    // 1–3 distinct products, each with a random variant.
    const lineCount = int(1, 3);
    const chosen = new Set<string>();
    const lines: OrderLine[] = [];
    const bagLines: BagLine[] = [];
    for (let k = 0; k < lineCount && chosen.size < baseProducts.length; k++) {
      let product = pick(baseProducts);
      let guard = 0;
      while (chosen.has(product.slug) && guard++ < 8) product = pick(baseProducts);
      if (chosen.has(product.slug)) continue;
      chosen.add(product.slug);
      const variant = pick(product.variants);
      const qty = rng() < 0.75 ? 1 : 2;
      lines.push({
        sku: variant.sku,
        slug: product.slug,
        qty,
        priceFils: variant.priceFils,
        name: product.name,
        size: variant.size,
        image: product.images.card,
      });
      bagLines.push({ sku: variant.sku, qty });
    }

    const notes = rng() < 0.3 ? (locale === "ar" ? pick(NOTES_AR) : pick(NOTES_EN)) : "";

    const details: Order["details"] = {
      name,
      phone,
      email,
      areaId: area.id,
      housing,
      block: String(int(1, 12)),
      street,
      avenue: rng() < 0.4 ? `Avenue ${int(1, 10)}` : "",
      building: String(int(1, 80)),
      floor: isHouse ? "" : String(int(1, 15)),
      apartment: isHouse ? "" : String(int(1, 40)),
      mapsLink: rng() < 0.15 ? `https://maps.app.goo.gl/${digits(10)}` : "",
      notes,
      deliveryMethod,
      paymentMethod: method,
      saveDetails: true,
    };

    drafts.push({
      id,
      placed,
      locale,
      lines,
      bagLines,
      details,
      method,
      bankId,
      deliveryMethod,
      promo,
      doneRoll: rng(),
      doneDaysRoll: rng(),
    });
  }

  // Every sample order is paid (CAPTURED); some are then marked done (fulfilled).
  const orders: Order[] = [];
  const done: Record<string, string> = {};

  for (const d of drafts) {
    const totals = computeTotals({
      lines: d.bagLines,
      deliveryMethod: d.deliveryMethod,
      promo: d.promo,
      catalog: baseCatalog,
      settings: defaultSettings,
    });

    const attempt: PaymentRecord = {
      method: d.method,
      result: "CAPTURED",
      paymentId: `100${digits(15)}`,
      trackId: d.id,
      tranId: digits(15),
      ref: digits(12),
      auth: digits(6),
      postDate: mmdd(d.placed),
      amountFils: totals.totalFils,
      ...(d.bankId ? { bankId: d.bankId } : {}),
      at: d.placed.toISOString(),
    };

    orders.push({
      id: d.id,
      createdAt: d.placed.toISOString(),
      locale: d.locale,
      lines: d.lines,
      totals,
      details: d.details,
      promoCode: d.promo?.code ?? null,
      bagKey: bagKey({ lines: d.bagLines, deliveryMethod: d.deliveryMethod, promo: d.promo }),
      method: d.method,
      status: "paid",
      attempts: [attempt],
      finalizedAt: d.placed.toISOString(),
    });

    const ageDays = (nowMs - d.placed.getTime()) / DAY;
    const makeDone = ageDays > 2 ? d.doneRoll < 0.85 : d.doneRoll < 0.12;
    if (makeDone) {
      const doneTime = Math.min(d.placed.getTime() + (1 + d.doneDaysRoll) * DAY, nowMs);
      done[d.id] = new Date(doneTime).toISOString();
    }
  }

  const fixed = fixedSampleOrders(now);
  return { orders: [...orders, ...fixed.orders], done: { ...done, ...fixed.done } };
}

// ── Fixed built-in orders ──────────────────────────────────────────────────────
// Specific, non-random sample orders that must always be present (and are topped up into admin
// browsers seeded before they existed — see the admin store's samplesVersion). Each has a stable
// id so the top-up never duplicates it.

/** A recent, paid-but-not-yet-fulfilled KNET order from the customer on +965 6709 5252. */
export function fixedSampleOrders(now: Date): { orders: Order[]; done: Record<string, string> } {
  const mmdd = (date: Date) => {
    const c = kuwaitClock(date);
    return `${String(c.month).padStart(2, "0")}${String(c.day).padStart(2, "0")}`;
  };
  // Placed yesterday (within the last two days) so it sits near the top of the dashboard.
  const placed = new Date(Math.min(now.getTime() - DAY, now.getTime()));

  const pick = (slug: string, fallback: number): Product => baseCatalog.bySlug.get(slug) ?? baseCatalog.visible[fallback];
  const chosen = [pick("i", 0), pick("cafe", 3)];

  const lines: OrderLine[] = [];
  const bagLines: BagLine[] = [];
  for (const product of chosen) {
    const variant = product.variants[0];
    lines.push({
      sku: variant.sku,
      slug: product.slug,
      qty: 1,
      priceFils: variant.priceFils,
      name: product.name,
      size: variant.size,
      image: product.images.card,
    });
    bagLines.push({ sku: variant.sku, qty: 1 });
  }

  const deliveryMethod = "standard" as const;
  const totals = computeTotals({ lines: bagLines, deliveryMethod, promo: null, catalog: baseCatalog, settings: defaultSettings });

  const details: Order["details"] = {
    name: "Abdulaziz Al-Mutairi",
    phone: "67095252",
    email: "a.almutairi@gmail.com",
    areaId: "jabriya",
    housing: "house",
    block: "4",
    street: "Street 11",
    avenue: "",
    building: "27",
    floor: "",
    apartment: "",
    mapsLink: "",
    notes: "Please call on arrival.",
    deliveryMethod,
    paymentMethod: "knet",
    saveDetails: true,
  };

  const attempt: PaymentRecord = {
    method: "knet",
    result: "CAPTURED",
    paymentId: "100479210385561027",
    trackId: FIXED_ORDER_ID,
    tranId: "481032957610423",
    ref: "582104739162",
    auth: "604218",
    postDate: mmdd(placed),
    amountFils: totals.totalFils,
    bankId: "nbk",
    at: placed.toISOString(),
  };

  const order: Order = {
    id: FIXED_ORDER_ID,
    createdAt: placed.toISOString(),
    locale: "en",
    lines,
    totals,
    details,
    promoCode: null,
    bagKey: bagKey({ lines: bagLines, deliveryMethod, promo: null }),
    method: "knet",
    status: "paid",
    attempts: [attempt],
    finalizedAt: placed.toISOString(),
  };

  // Paid but still pending (not marked done), so it stays near the top.
  return { orders: [order], done: {} };
}
