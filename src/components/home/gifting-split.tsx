import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { productBySlug } from "@/data/products";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatKWD } from "@/lib/money";
import { SplitPanel } from "./split-panel";

export async function GiftingSplit() {
  const t = await getTranslations("home.gifting");
  const locale = (await getLocale()) as Locale;
  const set = productBySlug("trilogy-set");
  const perks = t.raw("perks") as string[];

  return (
    <SplitPanel image="lifestyle/trio-basket" alt={t("alt")} className="bg-ivory text-ink" labelledBy="gifting-title">
      <p className="caps text-[12px] text-muted md:text-[13px]">{t("eyebrow")}</p>
      <h2 id="gifting-title" className="caps mt-3 font-serif text-title-sm font-medium md:text-title">
        {t("title")}
      </h2>
      <p className="mt-5 max-w-md text-[16px] leading-[1.8] text-ink/85">{t("text")}</p>
      <ul className="mt-8 w-full max-w-sm divide-y divide-ink/15 border-y border-ink/15 text-[15px]">
        {perks.map((perk) => (
          <li key={perk} className="py-3">
            {perk}
          </li>
        ))}
      </ul>
      {set && (
        <p className="mt-8 flex flex-wrap items-baseline justify-center gap-x-3">
          <span className="caps font-serif text-[21px] font-medium">
            <bdi lang="en">{set.name}</bdi>
          </span>
          <bdi className="figures text-[16px]">{formatKWD(set.variants[0].priceFils, locale)}</bdi>
        </p>
      )}
      <div className="mt-5 flex w-full max-w-sm flex-col items-center gap-1">
        <Button asChild block size="lg">
          <Link href="/product/trilogy-set">{t("cta")}</Link>
        </Button>
        <Button asChild variant="link" className="min-h-11 text-[14px]">
          <Link href="/shop/gift-sets">{t("secondary")}</Link>
        </Button>
      </div>
    </SplitPanel>
  );
}
