import { getTranslations } from "next-intl/server";
import type { Category } from "@/data/categories";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

const link = "inline-flex min-h-11 items-center transition-colors hover:text-ink hover:underline underline-offset-4";

/** Shop / category / product — small, muted, above the eyebrow. ("Home" is also a category.) */
export async function ProductBreadcrumb({ name, category, locale }: { name: string; category?: Category; locale: Locale }) {
  const t = await getTranslations("product.breadcrumb");
  return (
    <nav aria-label={t("label")} className="-my-2">
      <ol className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
        <li>
          <Link href="/shop" className={link}>
            {t("shop")}
          </Link>
        </li>
        {category && (
          <>
            <li aria-hidden>/</li>
            <li>
              <Link href={`/shop/${category.slug}`} className={link}>
                {category.name[locale]}
              </Link>
            </li>
          </>
        )}
        <li aria-hidden>/</li>
        <li aria-current="page" className="text-ink">
          <bdi lang="en">{name}</bdi>
        </li>
      </ol>
    </nav>
  );
}
