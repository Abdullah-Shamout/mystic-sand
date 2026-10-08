"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { ApplePayLogo, PaymentMarks } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Skeleton } from "@/components/ui/skeleton";
import { productBySku, productBySlug, trilogySlugs } from "@/data/products";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
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
  if (trilogyIn.length >= 1 && trilogyIn.length <= 2 && !inBag.has("trilogy-set")) {
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
  return (
    <div className="bg-tile px-6 py-4">
      <p className="text-[14px]">
        {unlocked ? t("freeDeliveryUnlocked") : t("freeDeliveryProgress", { amount: isolatedKWD(remaining, locale) })}
      </p>
      <div
        className="mt-2 h-[3px] w-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t("freeDeliveryUnlocked")}
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
                size="sm"
                value={line.qty}
                max={maxQtyFor(line.sku)}
                onChange={(q) => setQty(line.sku, q)}
                label={line.product.name}
              />
              <button
                type="button"
                onClick={() => removeLine(line.sku, line.product.name)}
                className="min-h-9 text-[12px] underline underline-offset-4 hover:text-danger"
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
          <button type="button" onClick={() => remove(line.sku)} className="underline underline-offset-4">
            {t("remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Upsells() {
  const t = useTranslations("cart");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const lines = useBag((s) => s.lines);
  const addToBag = useAddToBag();
  const { title, products } = pickUpsells(lines);
  if (products.length === 0) return null;
  return (
    <section className="px-6 py-5" aria-labelledby="upsell-title">
      <h3 id="upsell-title" className="caps text-[13px] text-muted">
        {t(title)}
      </h3>
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
                className="caps mt-2 inline-flex h-9 items-center justify-center gap-1.5 border border-ink text-[12px] transition-colors hover:bg-ink hover:text-paper"
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

/** Gift wrap + reassurance. Lives in the scrolling part so the pinned footer stays short. */
export function BagExtras() {
  const t = useTranslations("cart");
  const giftWrap = useBag((s) => s.giftWrap);
  const setGiftWrap = useBag((s) => s.setGiftWrap);
  return (
    <div className="space-y-4 px-6 py-5">
      <Checkbox
        checked={giftWrap}
        onChange={(e) => setGiftWrap(e.target.checked)}
        label={t("giftWrap")}
        description={t("giftWrapNote")}
      />
      <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
        <PaymentMarks />
        <p className="text-center text-[12px] text-muted">{t("secure")}</p>
        <p className="text-center text-[12px] text-muted">{t("returns")}</p>
      </div>
    </div>
  );
}

export function BagSummary({ onNavigate, compact = false }: { onNavigate?: () => void; compact?: boolean }) {
  const t = useTranslations("cart");
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const giftWrap = useBag((s) => s.giftWrap);
  const totals = computeTotals({ lines, promo, giftWrap });
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
        <Link href="/checkout" onClick={onNavigate} aria-disabled={blocked || undefined} data-testid="bag-checkout">
          {t("checkout")}
        </Link>
      </Button>
      <Link
        href="/checkout?express=applepay"
        onClick={onNavigate}
        className="flex h-12 w-full items-center justify-center bg-ink text-paper transition-opacity hover:opacity-90"
        aria-label={t("applePay")}
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
        <Link href="/shop/eau-de-parfum" onClick={onNavigate}>
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
  const mounted = useMounted();
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const giftWrap = useBag((s) => s.giftWrap);

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

  const totals = computeTotals({ lines, promo, giftWrap });
  return (
    <div className={cn(variant === "page" && "border border-line")}>
      <FreeDeliveryBar remaining={totals.freeDeliveryRemainingFils} threshold={totals.freeDeliveryThresholdFils} />
      <BagLines onNavigate={onNavigate} />
      <div className="border-t border-line">
        <Upsells />
      </div>
      {variant === "drawer" && (
        <div className="border-t border-line">
          <BagExtras />
        </div>
      )}
    </div>
  );
}
