"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { ApplePayLogo, PaymentMarks } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Skeleton } from "@/components/ui/skeleton";
import { productBySku, productBySlug, trilogySlugs } from "@/data/products";
import type { Product } from "@/data/types";
import { EXPRESS_APPLE_PAY_EVENT } from "@/components/checkout/events";
import { Link, usePathname } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";
import { isolatedKWD } from "@/lib/money";
import { computeTotals, priceLines, type BagLine } from "@/lib/pricing";
import { useAddToBag } from "@/lib/use-add-to-bag";
import { maxQtyFor, useBag } from "@/store/bag";
import { useUi } from "@/store/ui";

/** At most two suggestions, never something already in the bag. */
function pickUpsells(lines: BagLine[]): { title: "upsellTrilogy" | "upsellPair"; products: Product[] } {
  if (lines.length >= 3) return { title: "upsellPair", products: [] };
  const inBag = new Set(lines.map((l) => productBySku(l.sku)?.product.slug).filter(Boolean) as string[]);
  const trilogyIn = trilogySlugs.filter((s) => inBag.has(s));
  if (trilogyIn.length >= 1 && trilogyIn.length <= 2) {
    const missing = trilogySlugs.filter((s) => !inBag.has(s)).map((s) => productBySlug(s)!);
    return { title: "upsellTrilogy", products: missing.slice(0, 2) };
  }
  const pairs = ["aura", "oud-chips", "cafe"].filter((s) => !inBag.has(s)).map((s) => productBySlug(s)!);
  return { title: "upsellPair", products: pairs.filter((p) => p.variants.length === 1).slice(0, 2) };
}

function FreeDeliveryBar({ remaining, threshold }: { remaining: number; threshold: number }) {
  const t = useTranslations("cart");
  const locale = useLocale() as Locale;
  const announce = useUi((s) => s.announce);
  const unlocked = remaining <= 0;
  const wasUnlocked = useRef(unlocked);
  useEffect(() => {
    if (unlocked && !wasUnlocked.current) announce(t("freeDeliveryAnnounce"));
    wasUnlocked.current = unlocked;
  }, [unlocked, announce, t]);
  const pct = Math.min(100, Math.round(((threshold - Math.max(0, remaining)) / threshold) * 100));
  const message = unlocked
    ? t("freeDeliveryUnlocked")
    : t("freeDeliveryProgress", { amount: isolatedKWD(remaining, locale) });
  return (
    <div className="bg-tile px-6 py-4">
      <p className="text-[14px]">{message}</p>
      <div
        className="mt-2 h-[3px] w-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={message}
        aria-label={t("freeDeliveryLabel")}
      >
        <div className="h-full bg-racing transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BagLines({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("cart");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const lines = useBag((s) => s.lines);
  const setQty = useBag((s) => s.setQty);
  const remove = useBag((s) => s.remove);
  const restore = useBag((s) => s.restore);
  const pushToast = useUi((s) => s.pushToast);
  const announce = useUi((s) => s.announce);
  const { priced, missing } = priceLines(lines);

  const removeLine = (sku: string, name: string) => {
    const removed = remove(sku);
    if (!removed) return;
    announce(tc("bag.removedAnnounce", { name }));
    pushToast({
      title: tc("bag.removed", { name }),
      actions: [{ label: tc("bag.undo"), onClick: () => restore(removed.line, removed.index) }],
    });
  };

  return (
    <ul className="divide-y divide-line">
      {priced.map((line) => (
        <li key={line.sku} className="flex gap-4 px-6 py-5" data-testid="bag-line">
          <Link
            href={`/product/${line.product.slug}`}
            onClick={onNavigate}
            className="relative block size-[104px] shrink-0 bg-tile sm:size-[120px]"
            tabIndex={-1}
            aria-hidden
          >
            <ResponsiveImage image={line.product.images.card} alt="" sizes="120px" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/product/${line.product.slug}`}
                  onClick={onNavigate}
                  className="caps block truncate font-serif text-[18px] font-medium hover:underline"
                >
                  <bdi lang="en">{line.product.name}</bdi>
                </Link>
                <p className="text-[13px] text-muted">
                  {line.product.type[locale]} · <bdi className="whitespace-nowrap">{line.variant.size[locale]}</bdi>
                </p>
              </div>
              <Price fils={line.lineFils} className="text-[15px] font-medium" />
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-3">
              <QuantityStepper
                value={line.qty}
                max={maxQtyFor(line.sku)}
                onChange={(q) => setQty(line.sku, q)}
                label={line.product.name}
              />
              <button
                type="button"
                onClick={() => removeLine(line.sku, line.product.name)}
                className="-me-2 min-h-11 px-2 text-[13px] underline underline-offset-4 hover:text-danger"
                aria-label={t("removeItem", { name: line.product.name })}
              >
                {t("remove")}
              </button>
            </div>
          </div>
        </li>
      ))}
      {missing.map((line) => (
        <li key={line.sku} className="flex items-center justify-between gap-4 px-6 py-4 text-[14px] text-danger">
          <span>{t("unavailable")}</span>
          <button type="button" onClick={() => remove(line.sku)} className="min-h-11 underline underline-offset-4">
            {t("remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Upsells({ heading: Heading = "h3" }: { heading?: "h2" | "h3" }) {
  const t = useTranslations("cart");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const lines = useBag((s) => s.lines);
  const addToBag = useAddToBag();
  const titleId = useId();
  const { title, products } = pickUpsells(lines);
  if (products.length === 0) return null;
  return (
    <section className="border-t border-line px-6 py-5" aria-labelledby={titleId}>
      <Heading id={titleId} className="caps text-[13px] text-muted">
        {t(title)}
      </Heading>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {products.map((p) => (
          <li key={p.slug} className="flex flex-col bg-tile">
            <div className="relative aspect-square">
              <ResponsiveImage image={p.images.card} alt="" sizes="160px" />
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <span className="caps truncate font-serif text-[16px] font-medium">
                <bdi lang="en">{p.name}</bdi>
              </span>
              <span className="text-[12px] text-muted">
                <bdi className="whitespace-nowrap">{p.variants[0].size[locale]}</bdi> · <Price fils={p.variants[0].priceFils} />
              </span>
              <button
                type="button"
                onClick={() => addToBag(p, p.variants[0])}
                className="caps mt-2 inline-flex h-11 items-center justify-center gap-1.5 border border-ink text-[12px] transition-colors hover:bg-ink hover:text-paper"
                aria-label={tc("product.quickAdd", { name: p.name })}
              >
                <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
                {t("add")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Reassurance. Lives in the scrolling part so the pinned footer stays short. */
export function BagExtras() {
  const t = useTranslations("cart");
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-5">
      <PaymentMarks />
      <p className="text-center text-[12px] text-muted">{t("secure")}</p>
      <p className="text-center text-[12px] text-muted">{t("returns")}</p>
    </div>
  );
}

export function BagSummary({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const t = useTranslations("cart");
  const pathname = usePathname();
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const totals = computeTotals({ lines, promo });
  const { missing } = priceLines(lines);
  const blocked = missing.length > 0;

  return (
    <div className={cn("space-y-3 px-6 py-5", compact && "py-4")}>
      <dl className="space-y-1.5 text-[14px]">
        <div className="flex justify-between">
          <dt>{t("subtotal")}</dt>
          <dd>
            <Price fils={totals.subtotalFils} />
          </dd>
        </div>
        {totals.discountFils > 0 && promo && (
          <div className="flex justify-between text-success">
            <dt>{t("discount", { code: promo.code })}</dt>
            <dd>
              −<Price fils={totals.discountFils} />
            </dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>
            {t("delivery")} <span className="text-[12px] text-muted">· {t("deliveryHint")}</span>
          </dt>
          <dd>
            <Price fils={totals.deliveryFils} free />
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-[16px] font-medium">
          <dt>{t("total")}</dt>
          <dd>
            <Price fils={totals.totalFils} />
          </dd>
        </div>
      </dl>
      <Button asChild size="lg" block className={cn(blocked && "pointer-events-none opacity-45")}>
        <Link
          href="/checkout"
          onClick={(e) => {
            // Unavailable items must be removed first (the link stays visible but inert).
            if (blocked) e.preventDefault();
            else onNavigate?.();
          }}
          aria-disabled={blocked || undefined}
          tabIndex={blocked ? -1 : undefined}
          data-testid="bag-checkout"
        >
          {t("checkout")}
        </Link>
      </Button>
      <Link
        href="/checkout?express=applepay"
        onClick={(e) => {
          if (blocked) {
            e.preventDefault();
            return;
          }
          onNavigate?.();
          // Already on /checkout, a query change doesn't remount the page: ask it directly.
          if (/^\/checkout\/?$/.test(pathname)) {
            e.preventDefault();
            window.dispatchEvent(new Event(EXPRESS_APPLE_PAY_EVENT));
          }
        }}
        aria-disabled={blocked || undefined}
        tabIndex={blocked ? -1 : undefined}
        className={cn(
          "flex h-12 w-full items-center justify-center bg-ink text-paper transition-opacity hover:opacity-90",
          blocked && "pointer-events-none opacity-45",
        )}
        aria-label={t("applePay")}
        data-testid="bag-applepay"
      >
        <ApplePayLogo className="h-11" label="" />
      </Link>
    </div>
  );
}

function EmptyBag({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("cart");
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-16 text-center">
      <p className="caps font-serif text-title-sm font-medium">{t("empty")}</p>
      <p className="max-w-xs text-[15px] text-muted">{t("emptyText")}</p>
      <Button asChild variant="primary">
        <Link href="/shop/perfumes" onClick={onNavigate}>
          {t("bestsellers")}
        </Link>
      </Button>
      <Button asChild variant="link">
        <Link href="/shop" onClick={onNavigate}>
          {t("continue")}
        </Link>
      </Button>
    </div>
  );
}

/** Body of the bag (shared by the drawer and /cart). Gated until the store is hydrated. */
export function BagView({ onNavigate, variant = "drawer" }: { onNavigate?: () => void; variant?: "drawer" | "page" }) {
  const t = useTranslations("cart");
  const mounted = useMounted();
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);

  if (!mounted) {
    return (
      <div className="space-y-4 p-6" aria-busy>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (lines.length === 0) return <EmptyBag onNavigate={onNavigate} />;

  const totals = computeTotals({ lines, promo });
  return (
    <div className={cn(variant === "page" && "border border-line")}>
      <FreeDeliveryBar remaining={totals.freeDeliveryRemainingFils} threshold={totals.freeDeliveryThresholdFils} />
      <BagLines onNavigate={onNavigate} />
      <Upsells heading={variant === "page" ? "h2" : "h3"} />
      {variant === "drawer" && (
        <div className="border-t border-line">
          <BagExtras />
          <div className="flex justify-center px-6 pb-5">
            <Link
              href="/cart"
              onClick={onNavigate}
              className="inline-flex min-h-11 items-center text-[13px] underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {t("viewFull")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
