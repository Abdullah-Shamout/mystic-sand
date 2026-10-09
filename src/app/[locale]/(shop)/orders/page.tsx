import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrderHistory } from "@/components/checkout/order-history";
import { SectionTitle } from "@/components/ui/section-title";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "checkout" });
  return { title: t("orders.meta.title") };
}

export default async function OrdersPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("checkout.orders");
  return (
    <div className="pb-24 md:pb-32">
      <SectionTitle as="h1" title={t("title")} subtitle={t("note")} />
      <div className="mx-auto max-w-[1040px] px-4 md:px-6">
        <OrderHistory />
      </div>
    </div>
  );
}
