import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaymentMarks } from "@/components/brand/brand-icons";
import { CheckoutHeader } from "@/components/layout/checkout-header";

export default async function CheckoutLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <p className="bg-ink px-4 py-1.5 text-center text-[12px] text-cream/90 print:hidden" role="note">
        {t("simulation")}
      </p>
      <CheckoutHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <footer className="border-t border-line bg-paper print:hidden">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-3 px-6 py-6 text-[12px] text-muted md:flex-row md:justify-between">
          <span>{t("footer.rights")}</span>
          <PaymentMarks />
        </div>
      </footer>
    </div>
  );
}
