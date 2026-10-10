"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ApplePayLogo, PaymentMarks, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/ui/price";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { maxQtyPerLine } from "@/data/site";
import type { Product } from "@/data/types";
import { useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { useMounted } from "@/lib/hooks";
import { useLiveSettings } from "@/lib/live";
import { whatsappHref } from "@/lib/settings";
import { useAddToBag } from "@/lib/use-add-to-bag";
import { useBag, useLineQty } from "@/store/bag";
import { useUi } from "@/store/ui";
import { isolate, PDP_END_ID } from "./constants";

// The mobile header is 64px + hairline; the main button counts as gone once it has
// slid completely under it.
const MOBILE_HEADER_PX = 65;

/**
 * Price → size → quantity → Add to bag / Buy now / Apple Pay, then the payment
 * marks and a WhatsApp help link. Also owns the phone-only buy bar that slides up
 * once the main Add to bag button has scrolled away.
 */
export function ProductPurchase({ product }: { product: Product }) {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const mounted = useMounted();
  const addToBag = useAddToBag();
  const openBag = useUi((s) => s.openBag);
  const settings = useLiveSettings();

  const [sku, setSku] = useState(() => (product.variants.find((v) => v.stock > 0) ?? product.variants[0]).sku);
  const variant = product.variants.find((v) => v.sku === sku) ?? product.variants[0];
  const max = Math.min(variant.stock, maxQtyPerLine);
  const soldOut = max <= 0;
  const [qtyWanted, setQty] = useState(1);
  const qty = Math.max(1, Math.min(qtyWanted, max));
  const inBag = useLineQty(variant.sku);
  const [busy, setBusy] = useState<"buy" | "applepay" | null>(null);

  const primaryRef = useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = useState(false);

  // Measured on scroll rather than with an IntersectionObserver: a fast fling (or a
  // restored scroll position) can jump straight past the button without ever
  // crossing an intersection threshold.
  useEffect(() => {
    const target = primaryRef.current;
    if (!target) return;
    const end = document.getElementById(PDP_END_ID);
    let frame = 0;
    const update = () => {
      frame = 0;
      const passed = target.getBoundingClientRect().bottom < MOBILE_HEADER_PX;
      // Hide again where the footer begins, so the bar never covers it.
      const atEnd = end ? end.getBoundingClientRect().top < window.innerHeight : false;
      setShowBar(passed && !atEnd);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const add = () => {
    addToBag(product, variant, { qty, openDrawer: true });
    setQty(1);
  };

  // Buy now / Apple Pay: make sure the chosen quantity is in the bag (never a duplicate
  // unit on a second tap), then go straight to checkout.
  const checkout = (method: "buy" | "applepay") => {
    setBusy(method);
    const bag = useBag.getState();
    bag.ensure(variant.sku);
    const current = useBag.getState().lines.find((l) => l.sku === variant.sku)?.qty ?? 0;
    if (current < qty) bag.setQty(variant.sku, qty);
    router.push(method === "applepay" ? "/checkout?express=applepay" : "/checkout");
    window.setTimeout(() => setBusy(null), 4000);
  };

  const whatsapp = (key: "helpText" | "notifyText") => whatsappHref(settings, t(key, { name: isolate(product.name) }));

  return (
    <div className="mt-5">
      <Price fils={variant.priceFils} className="text-[20px]" />

      {product.variants.length > 1 ? (
        <fieldset className="mt-6">
          <legend className="caps text-[13px]">{tc("product.chooseSize")}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.variants.map((v) => {
              const out = v.stock <= 0;
              return (
                <label
                  key={v.sku}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-full border px-5 text-[14px] transition-colors duration-150",
                    "has-checked:border-ink has-checked:bg-ink has-checked:text-paper",
                    "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-racing",
                    out ? "cursor-not-allowed border-line text-muted line-through" : "cursor-pointer border-ink/25 hover:border-ink",
                  )}
                >
                  <input
                    type="radio"
                    name={`size-${product.slug}`}
                    value={v.sku}
                    checked={v.sku === variant.sku}
                    disabled={out}
                    onChange={() => setSku(v.sku)}
                    className="sr-only"
                  />
                  <bdi className="figures">{v.size[locale]}</bdi>
                  {out && <span className="sr-only">{` — ${tc("product.soldOut")}`}</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="mt-3 text-[14px]">
          <span className="text-muted">{t("size")}</span>
          <bdi className="figures ms-3">{variant.size[locale]}</bdi>
        </p>
      )}

      {!soldOut && (
        <div className="mt-6 flex items-center gap-5">
          <span aria-hidden className="caps text-[13px]">
            {t("quantity")}
          </span>
          <QuantityStepper value={qty} max={max} onChange={setQty} label={product.name} />
        </div>
      )}

      {mounted && inBag > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[14px] text-muted">
          <Check className="size-4 text-success" strokeWidth={1.5} aria-hidden />
          <span>{t("inBag", { count: inBag, n: String(inBag) })}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={openBag}
            className="min-h-11 text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
          >
            {tc("bag.viewBag")}
          </button>
        </p>
      )}

      <div className="mt-6 space-y-2">
        <div ref={primaryRef}>
          {soldOut ? (
            <Button size="lg" block disabled>
              {tc("product.soldOut")}
            </Button>
          ) : (
            <Button size="lg" block onClick={add} data-testid="pdp-add-to-bag">
              {tc("product.addToBag")}
            </Button>
          )}
        </div>
        {soldOut ? (
          <Button asChild variant="secondary" size="lg" block>
            <a href={whatsapp("notifyText")} target="_blank" rel="noreferrer">
              <WhatsAppIcon className="size-[18px]" />
              {t("notify")}
            </a>
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" block busy={busy === "buy"} onClick={() => checkout("buy")}>
              {t("buyNow")}
            </Button>
            <button
              type="button"
              onClick={() => (busy ? undefined : checkout("applepay"))}
              aria-label={t("applePay")}
              aria-busy={busy === "applepay" || undefined}
              className="flex h-[52px] w-full items-center justify-center bg-ink text-paper transition-opacity duration-150 hover:opacity-85 aria-busy:cursor-progress aria-busy:opacity-70"
            >
              <ApplePayLogo className="h-11" label="" />
            </button>
          </>
        )}
      </div>

      <PaymentMarks className="mt-4 justify-center" />

      <div className="mt-6 border-t border-line pt-5">
        <a
          href={whatsapp("helpText")}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-3 text-[14px] text-ink underline-offset-4 hover:underline"
        >
          <WhatsAppIcon className="size-[18px] shrink-0" />
          {t("help")}
        </a>
      </div>

      {/* Phones: compact buy bar, shown only once the main button is out of view. */}
      <div
        aria-hidden={!showBar}
        inert={!showBar}
        className={cn(
          "safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper transition-[translate,visibility] duration-300 ease-[var(--ease-soft)] lg:hidden",
          showBar ? "visible translate-y-0" : "invisible translate-y-full",
        )}
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="caps truncate font-serif text-[18px] font-medium">
              <bdi lang="en">{product.name}</bdi>
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted">
              <bdi className="figures">{variant.size[locale]}</bdi> · <Price fils={variant.priceFils} />
            </p>
          </div>
          {soldOut ? (
            <Button size="md" disabled className="shrink-0 px-5">
              {tc("product.soldOut")}
            </Button>
          ) : (
            <Button size="md" onClick={add} className="shrink-0 px-5">
              {tc("product.addToBag")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
