"use client";

import { ChevronDown, ShoppingBag, Tag, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { toLatinDigits } from "@/lib/digits";
import { useLiveCatalog, useLiveSettings } from "@/lib/live";
import { computeTotals, priceLines, type Totals } from "@/lib/pricing";
import { useBag } from "@/store/bag";
import { useUi } from "@/store/ui";

/** Live order totals (one delivery fee, always charged on a non-empty bag). */
export function useCheckoutTotals(): { totals: Totals } {
  const lines = useBag((s) => s.lines);
  const promo = useBag((s) => s.promo);
  const catalog = useLiveCatalog();
  const settings = useLiveSettings();
  return { totals: computeTotals({ lines, promo, catalog, settings }) };
}

function Row({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <dt>{label}</dt>
      <dd className="text-end">{children}</dd>
    </div>
  );
}

/** Subtotal → total, shared by the summary and the Apple Pay sheet. */
export function TotalsList({
  totals,
  promoCode,
  totalLabel,
  className,
}: {
  totals: Totals;
  promoCode: string | null;
  totalLabel?: string;
  className?: string;
}) {
  const t = useTranslations("checkout.summary");
  const tc = useTranslations("cart");
  return (
    <dl className={cn("space-y-2 text-[14px]", className)}>
      <Row label={tc("subtotal")}>
        <Price fils={totals.subtotalFils} />
      </Row>
      {totals.discountFils > 0 && (
        <Row label={tc("discount", { code: promoCode ?? "" })} className="text-success">
          −<Price fils={totals.discountFils} />
        </Row>
      )}
      <Row label={t("delivery")}>
        <Price fils={totals.deliveryFils} />
      </Row>
      <Row label={totalLabel ?? tc("total")} className="border-t border-line pt-3 text-[17px] font-medium">
        <Price fils={totals.totalFils} />
      </Row>
    </dl>
  );
}

function SummaryLines() {
  const t = useTranslations("checkout.summary");
  const locale = useLocale() as Locale;
  const lines = useBag((s) => s.lines);
  const catalog = useLiveCatalog();
  const { priced } = priceLines(lines, catalog);
  return (
    <ul className="divide-y divide-line">
      {priced.map((line) => (
        <li key={line.sku} className="flex items-center gap-4 py-4">
          <div className="relative size-16 shrink-0 bg-paper">
            <ResponsiveImage image={line.product.images.card} alt="" sizes="64px" />
          </div>
          <div className="min-w-0 flex-1 leading-snug">
            <p className="caps truncate font-serif text-[18px] font-medium">
              <bdi lang="en">{line.product.name}</bdi>
            </p>
            <p className="text-[13px] text-muted">
              {line.product.type[locale]} · <bdi className="whitespace-nowrap">{line.variant.size[locale]}</bdi>
            </p>
            <p className="figures text-[13px] text-muted">{t("qty", { qty: line.qty })}</p>
          </div>
          <Price fils={line.lineFils} className="text-[15px]" />
        </li>
      ))}
    </ul>
  );
}

/** "Have a code?" — collapsed until needed; an applied code shows as a removable chip. */
export function PromoField() {
  const t = useTranslations("checkout.promo");
  const tc = useTranslations("common");
  const promo = useBag((s) => s.promo);
  const applyPromo = useBag((s) => s.applyPromo);
  const removePromo = useBag((s) => s.removePromo);
  const announce = useUi((s) => s.announce);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<"invalid" | "expired" | null>(null);
  const id = useId();

  if (promo) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-h-11 items-center gap-2 border border-ink/20 bg-paper ps-3 text-[13px]">
          <Tag className="size-3.5" strokeWidth={1.5} aria-hidden />
          <bdi className="figures font-medium">{promo.code}</bdi>
          <span className="text-muted">· {t("off", { percent: promo.percent })}</span>
          <button
            type="button"
            onClick={() => {
              removePromo();
              announce(t("removed"));
            }}
            className="inline-flex size-11 items-center justify-center text-muted transition-colors hover:text-ink"
            aria-label={t("remove", { code: promo.code })}
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 text-[14px] underline decoration-1 underline-offset-4 hover:decoration-2"
      >
        <Tag className="size-3.5" strokeWidth={1.5} aria-hidden />
        {t("toggle")}
      </button>
      <form
        id={id}
        hidden={!open}
        className="mt-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const value = toLatinDigits(code).trim();
          if (!value) return;
          const result = applyPromo(value, new Date());
          if (result === "applied") {
            const applied = useBag.getState().promo;
            setError(null);
            setCode("");
            setOpen(false);
            if (applied) announce(tc("promo.applied", { code: applied.code, percent: applied.percent }));
          } else {
            setError(result);
            announce(tc(`promo.${result}`));
          }
        }}
      >
        <label htmlFor={`${id}-input`} className="sr-only">
          {t("label")}
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-input`}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            placeholder={t("label")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            enterKeyHint="done"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn(
              "h-[52px] min-w-0 flex-1 border bg-paper px-3.5 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-ink",
              error ? "border-danger" : "border-line",
            )}
          />
          <Button type="submit" variant="secondary">
            {t("apply")}
          </Button>
        </div>
        {error && (
          <p id={`${id}-error`} className="mt-1.5 text-[13px] text-danger">
            {tc(`promo.${error}`)}
          </p>
        )}
      </form>
    </div>
  );
}

function SummaryBody() {
  const t = useTranslations("checkout.summary");
  const { totals } = useCheckoutTotals();
  const promo = useBag((s) => s.promo);
  return (
    <>
      <SummaryLines />
      <div className="border-t border-line py-4">
        <PromoField />
      </div>
      <TotalsList totals={totals} promoCode={promo?.code ?? null} className="border-t border-line pt-4" />
      <p className="mt-3 text-[13px] text-muted">{t("finalNote")}</p>
    </>
  );
}

/** Desktop: sticky panel beside the form. */
export function OrderSummaryPanel() {
  const t = useTranslations("checkout.summary");
  const openBag = useUi((s) => s.openBag);
  return (
    <section
      aria-labelledby="ck-summary-title"
      className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain bg-tile px-8 pt-7 pb-8"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="ck-summary-title" className="caps font-serif text-[22px] font-medium">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={openBag}
          className="min-h-11 text-[13px] underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t("edit")}
        </button>
      </div>
      <SummaryBody />
    </section>
  );
}

/** Mobile: a collapsed band at the top — "Show order summary · KWD 25.500". */
export function MobileOrderSummary() {
  const t = useTranslations("checkout.summary");
  const openBag = useUi((s) => s.openBag);
  const { totals } = useCheckoutTotals();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section aria-label={t("title")} className="border-b border-line bg-tile lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-start text-[14px] md:px-6"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="size-[18px] shrink-0" strokeWidth={1.25} aria-hidden />
          {open ? t("hide") : t("show")}
          <ChevronDown
            className={cn("size-4 shrink-0 transition-transform duration-300", open && "rotate-180")}
            strokeWidth={1.25}
            aria-hidden
          />
        </span>
        <Price fils={totals.totalFils} className="text-[16px] font-medium" />
      </button>
      <div id={id} hidden={!open} className="border-t border-line px-4 pb-6 md:px-6">
        <SummaryBody />
        <button
          type="button"
          onClick={openBag}
          className="mt-2 min-h-11 text-[13px] underline decoration-1 underline-offset-4"
        >
          {t("edit")}
        </button>
      </div>
    </section>
  );
}
