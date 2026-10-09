"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Price } from "@/components/ui/price";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { Product } from "@/data/types";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { isolatedKWD } from "@/lib/money";
import { useAddToBag } from "@/lib/use-add-to-bag";

const SIZES = "(min-width: 1024px) 25vw, 50vw";

/**
 * Amouage-style product tile (still-life packshot on a warm tile, hover swaps to the
 * box/scene, centred NAME · type · price) plus the quick add Amouage lacks.
 * The quick-add button is a sibling of the links — never a button inside <a>.
 */
export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const t = useTranslations("common");
  const locale = useLocale() as Locale;
  const addToBag = useAddToBag();
  const variant = product.variants[0];
  const multi = product.variants.length > 1;
  const soldOut = product.variants.every((v) => v.stock <= 0);
  const href = `/product/${product.slug}`;
  const minPrice = Math.min(...product.variants.map((v) => v.priceFils));

  const quickAdd = (className: string) =>
    soldOut ? null : multi ? (
      <Link
        href={href}
        className={cn(
          "caps inline-flex h-11 items-center justify-center gap-1.5 border border-ink bg-paper/95 text-[12px] transition-colors hover:bg-ink hover:text-paper",
          className,
        )}
      >
        {t("product.chooseSize")}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => addToBag(product, variant)}
        className={cn(
          "caps inline-flex h-11 items-center justify-center gap-1.5 border border-ink bg-paper/95 text-[12px] transition-colors hover:bg-ink hover:text-paper",
          className,
        )}
        aria-label={t("product.quickAdd", { name: product.name })}
        data-testid={`quick-add-${product.slug}`}
      >
        <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
        {t("product.addToBag")}
      </button>
    );

  return (
    <article className="group relative flex h-full flex-col bg-tile">
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden className="relative block aspect-square overflow-hidden">
          <ResponsiveImage
            image={product.images.card}
            alt=""
            sizes={SIZES}
            priority={priority}
            className="transition-transform duration-500 ease-[var(--ease-soft)] group-hover:scale-[1.03]"
          />
          {product.images.hover && (
            <span className="absolute inset-0 bg-tile opacity-0 transition-opacity duration-500 group-hover:opacity-100">
              <ResponsiveImage
                image={product.images.hover}
                alt=""
                sizes={SIZES}
                className="transition-transform duration-500 group-hover:scale-[1.03]"
              />
            </span>
          )}
          {soldOut && <span className="absolute inset-0 bg-tile/70" />}
        </Link>
        {(product.badge || soldOut) && (
          <span
            className={cn(
              "caps pointer-events-none absolute start-4 top-4 border px-2 text-[10px] leading-5 font-medium",
              soldOut ? "border-ink bg-ink text-cream" : "border-ink/70 text-ink/80",
            )}
          >
            {soldOut ? t("product.soldOut") : t("product.new")}
          </span>
        )}
        {/* Desktop: slides up over the image on hover / keyboard focus */}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 hidden translate-y-2 opacity-0 transition-all duration-300 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 lg:block">
          {quickAdd("w-full")}
        </div>
      </div>

      <Link href={href} className="flex flex-1 flex-col items-center px-4 pt-5 pb-4 text-center lg:pb-7">
        <h3 className="caps font-serif text-[21px] leading-tight font-medium md:text-[23px]">
          <bdi lang="en">{product.name}</bdi>
        </h3>
        <p className="mt-1 text-[13px] text-muted md:text-[14px]">
          {product.type[locale]}
          {!multi && (
            <>
              {" · "}
              <bdi className="whitespace-nowrap">{variant.size[locale]}</bdi>
            </>
          )}
        </p>
        <p className="mt-1.5 text-[15px] font-medium">
          {multi ? (
            t("product.from", { price: isolatedKWD(minPrice, locale) })
          ) : (
            <Price fils={variant.priceFils} />
          )}
        </p>
      </Link>

      {/* Mobile / tablet: always visible */}
      <div className="px-3 pb-4 lg:hidden">{quickAdd("w-full")}</div>
    </article>
  );
}
