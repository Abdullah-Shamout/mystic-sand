import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CartPage } from "@/components/cart/cart-page";
import { SectionTitle } from "@/components/ui/section-title";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cart" });
  return { title: t("meta.title") };
}

export default async function CartRoute({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("cart");
  return (
    <div className="pb-24 md:pb-32">
      <SectionTitle as="h1" title={t("pageTitle")} />
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <CartPage />
      </div>
    </div>
  );
}
