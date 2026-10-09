# Mystic Sand — online store prototype

A clickable, frontend-only prototype of the **Mystic Sand** perfume store
(Instagram [@mystic.sand](https://www.instagram.com/mystic.sand/) — *Timeless scents that capture the moment, Made in Kuwait*).

**Live demo:** https://abdullah-shamout.github.io/mystic-sand/

- English and Arabic (full right-to-left layout), switchable on every page
- Four collections, each its own page and reached from the ☰ menu: Perfumes, Oud, Body and Home
- Luxury, Amouage-inspired design in the brand's colours: Sand `#CBBD93` and British Racing Green `#004225`
- Easy shopping: quick add from any product grid, bag drawer with the delivery fee shown upfront, one-page guest checkout
- Kuwait checkout: area search that fills the governorate, block/street/avenue/house fields, +965 mobile validation, prices in KWD (3 decimals)
- Payments: **KNET** (default), Apple Pay and Visa/Mastercard — **simulated**, see below
- Built-in **admin area** (orders dashboard, product & collection editing, product analysis, store settings) — English/Arabic, opened with **Enter** in the header (see below)

> This is a prototype for review. Prices, some fragrance notes, delivery fees, contact details and policy texts are placeholders marked `TODO(client)` in `src/data/`.

## Payments (simulation)

No real payment is processed and the site never asks for card numbers, PINs or SMS codes.
The checkout creates an order and opens an in-site simulation of KNET's hosted page (bank → card → submit → confirm → SMS code), with a demo panel to choose the outcome: `CAPTURED`, `NOT CAPTURED`, `CANCELED` or `PENDING`. The result page shows the same fields KNET returns to a merchant (payment ID, transaction ID, track ID, reference, auth code, post date).

For production, replace `src/lib/payments/mock.ts` with a server-side integration (KNET through the acquiring bank, or a provider such as MyFatoorah, Tap, UPayments, Hesabe or Ottu): the server creates the payment, redirects to the provider's hosted page, and **verifies the result server-side** before marking an order paid.

**Presenter tools:** add `?demo=1` to any URL to show a small *Demo* panel (fill a sample Kuwait address, choose the next payment result, reset demo data). `?reset=1` clears the bag and orders; `?code=SAND10` applies a demo promo code.

## Admin area

A built-in, browser-only back office for running the demo store. Open it with **"Enter"** at the top of the header (it reads **"دخول"** in Arabic), or go straight to **`/<locale>/admin/`** (for example `/en/admin/` or `/ar/admin/`). It is fully English/Arabic with right-to-left support, like the rest of the site.

**Default sign-in:** username `admin`, password `MysticSand2026`. Change them in **Settings → Admin account** (enter the current password, then a new username and/or a password of at least 8 characters). Credentials are kept only as a SHA-256 hash in this browser.

**What each tab does**

- **Orders** — every order, with KPIs (revenue from completed orders, completed and pending counts, average order), filters (date, status, payment method, delivery, source) and search by customer name or order number (Latin or Arabic digits). Open an order to see all its details, **mark it done** (paid orders only), **download a PDF receipt** or print it, or message the customer on WhatsApp. **Export to Excel** downloads the filtered orders.
- **Products** — add a product or edit any existing one: names, descriptions and fragrance notes in English and Arabic, sizes/prices (KWD) and stock, **photos** (from the site library or uploaded), the **collections** it appears in, a "New" badge and visibility. Move a product between collections, **hide/show** it, reset an edited base product to the original, or **delete** a custom product. The four collection names and descriptions are editable too.
- **Product analysis** — units ordered per product, grouped by collection and searchable, with revenue (before order discounts), order counts, current price and stock. **Export** a single collection, or **Export all collections** at once, to Excel.
- **Settings** — delivery fees (standard and express), the WhatsApp and phone numbers, the **top-banner** messages (per language), the **admin account**, and **Data & backups**: a storage meter, **download backup / restore** (so data can move to another device), **clear or restore the sample orders**, reset catalog edits or settings, and delete unused photos.

The dashboard is seeded with about 30 realistic sample orders (tagged **Sample**) so it looks alive; any real order placed in this browser appears alongside them. Clear or restore the samples from **Settings → Data**.

### Important limits (please read before any real use)

This admin area is a **frontend-only prototype**. There is no server and no database — everything lives in the **current browser's storage on the current device**:

- **One browser only.** Orders placed by shoppers on other devices or browsers **do not arrive here**, and product, price or settings edits made here are **not seen by other shoppers**. Each browser keeps its own separate copy.
- **The sign-in is a demo gate, not real security.** Anyone with the device can open the admin, and the default hash ships in the public bundle. It only keeps casual visitors out of the way.
- **Safari may erase the data.** Safari (and iOS) clears this kind of storage after **7 days without a visit**. Use **Settings → Data → Download backup** regularly, and prefer **Chrome or Edge** on the admin device.
- **Shared storage on github.io.** Every project site under the same `*.github.io` account shares one storage area, so other repositories on that account can read or clash with this data. **Use a custom domain** before any real use.
- **Stock is not reduced by orders.** Placing an order does not decrement a product's stock.

**A real launch needs a backend:** orders and products in a database, real authentication (server-side sessions), and **server-verified payments** (see *Payments* above). Treat this admin area as a design and workflow preview, not a production system.

## Tech

Next.js 16 (App Router, static export) · React 19 · TypeScript · Tailwind CSS 4 · next-intl · zustand · Radix UI · react-hook-form + zod · Embla Carousel

## Getting started

```bash
npm ci
npm run dev            # http://localhost:3000/en/
npm run build          # static site in ./out
npm run preview        # serves ./out at http://localhost:4318
npm run typecheck && npm run lint
npm test               # Playwright end-to-end tests (needs Google Chrome and a build)
```

## Media

The original photos and videos are not stored in this repository (one video is larger than GitHub's 100 MB limit).
The optimised versions in `public/images` and `public/videos` were generated from them and are committed.
To regenerate, place the originals in `../photos` and `../videos` next to this folder and run:

```bash
npm run media:images   # responsive WebP images + src/data/media.generated.json
npm run media:videos   # compressed MP4s + poster frames
npm run media:logo     # vector logo, app icons and link-preview image
```

## Deployment

Every push to `main` builds the static export and publishes it to GitHub Pages (`.github/workflows/deploy.yml`).
The workflow sets `NEXT_PUBLIC_BASE_PATH` to the repository path, so the site works under `/<repo>/`.

## Structure

```
src/app/[locale]/(shop)/      home, collections, product, bag, orders, contact, FAQ, policies
src/app/[locale]/(checkout)/  checkout, payment simulation, result
src/app/[locale]/(admin)/     admin area: orders, products, product analysis, settings
src/components/               ui kit, layout, product, cart, checkout, payment, home, content, admin
src/data/                     catalog, categories, Kuwait areas, banks, store settings
src/lib/                      money, pricing, phone, delivery, search, payments; admin-auth and lib/admin (receipt, Excel, analytics, samples, backup)
src/store/                    bag, checkout, catalog, settings and admin stores (saved in the browser)
messages/{en,ar}/             all interface text (includes the admin namespace)
scripts/                      media pipeline and screenshot tool
```
