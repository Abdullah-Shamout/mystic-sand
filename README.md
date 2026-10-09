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

> This is a prototype for review. Prices, some fragrance notes, delivery fees, contact details and policy texts are placeholders marked `TODO(client)` in `src/data/`.

## Payments (simulation)

No real payment is processed and the site never asks for card numbers, PINs or SMS codes.
The checkout creates an order and opens an in-site simulation of KNET's hosted page (bank → card → submit → confirm → SMS code), with a demo panel to choose the outcome: `CAPTURED`, `NOT CAPTURED`, `CANCELED` or `PENDING`. The result page shows the same fields KNET returns to a merchant (payment ID, transaction ID, track ID, reference, auth code, post date).

For production, replace `src/lib/payments/mock.ts` with a server-side integration (KNET through the acquiring bank, or a provider such as MyFatoorah, Tap, UPayments, Hesabe or Ottu): the server creates the payment, redirects to the provider's hosted page, and **verifies the result server-side** before marking an order paid.

**Presenter tools:** add `?demo=1` to any URL to show a small *Demo* panel (fill a sample Kuwait address, choose the next payment result, reset demo data). `?reset=1` clears the bag and orders; `?code=SAND10` applies a demo promo code.

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
src/components/               ui kit, layout, product, cart, checkout, payment, home, content
src/data/                     catalog, categories, Kuwait areas, banks, store settings
src/lib/                      money, pricing, phone, delivery, search, payments
src/store/                    bag and checkout stores (saved in the browser)
messages/{en,ar}/             all interface text
scripts/                      media pipeline and screenshot tool
```
