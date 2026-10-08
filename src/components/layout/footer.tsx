import { getLocale, getTranslations } from "next-intl/server";
import { InstagramIcon, PaymentMarks, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Logo } from "@/components/brand/logo";
import { site, whatsappLink } from "@/data/site";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { NewsletterForm } from "./newsletter-form";

type Column = { title: string; links: Array<{ href: string; label: string }> };

function FooterColumn({ column }: { column: Column }) {
  const links = (
    <ul className="space-y-1.5">
      {column.links.map((l) => (
        <li key={l.href + l.label}>
          <Link href={l.href} className="inline-block py-1 text-[14px] font-light text-cream/90 hover:text-cream hover:underline">
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {/* Mobile: accordion */}
      <details className="group border-b border-cream/20 md:hidden">
        <summary className="caps flex min-h-14 cursor-pointer list-none items-center justify-between text-[15px] [&::-webkit-details-marker]:hidden">
          {column.title}
          <span aria-hidden className="text-xl leading-none group-open:hidden">
            +
          </span>
          <span aria-hidden className="hidden text-xl leading-none group-open:inline">
            −
          </span>
        </summary>
        <div className="pb-5">{links}</div>
      </details>
      {/* Desktop */}
      <div className="hidden md:block">
        <h2 className="caps mb-5 text-[15px]">{column.title}</h2>
        {links}
      </div>
    </>
  );
}

/** Racing-green footer (Amouage's black footer, in the brand's accent colour). */
export async function Footer() {
  const t = await getTranslations("common");
  const locale = (await getLocale()) as Locale;

  const columns: Column[] = [
    {
      title: t("footer.shop"),
      links: [
        { href: "/shop/eau-de-parfum", label: t("nav.perfumes") },
        { href: "/shop/body", label: t("nav.body") },
        { href: "/shop/home", label: t("nav.home") },
        { href: "/shop/gift-sets", label: t("nav.gifts") },
        { href: "/our-story", label: t("nav.story") },
      ],
    },
    {
      title: t("footer.care"),
      links: [
        { href: "/delivery", label: t("footer.delivery") },
        { href: "/refund-policy", label: t("footer.returns") },
        { href: "/faq#payment", label: t("footer.payment") },
        { href: "/faq", label: t("footer.faq") },
        { href: "/contact", label: t("footer.contact") },
        { href: "/orders", label: t("footer.orders") },
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { href: "/terms", label: t("footer.terms") },
        { href: "/privacy", label: t("footer.privacy") },
      ],
    },
  ];

  return (
    <footer className="bg-racing text-cream">
      <div className="mx-auto max-w-[1720px] px-6 pt-16 pb-6 md:pt-[90px]">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_minmax(0,1.4fr)] md:gap-8">
          <div className="space-y-5 text-center md:text-start">
            <Logo variant="full" className="mx-auto h-16 w-auto text-cream md:mx-0" title={t("brand")} />
            <p className="mx-auto max-w-xs text-[14px] font-light text-cream/85 md:mx-0">{t("footer.tagline")}</p>
            <div className="flex items-center justify-center gap-1 md:justify-start">
              <span className="text-[13px] text-cream/70">{t("footer.follow")}</span>
              <a
                href={site.instagram.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-11 items-center justify-center hover:opacity-75"
                aria-label="Instagram @mystic.sand"
              >
                <InstagramIcon className="size-5" />
              </a>
              <a
                href={whatsappLink(t("brand"))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-11 items-center justify-center hover:opacity-75"
                aria-label={t("footer.whatsapp")}
              >
                <WhatsAppIcon className="size-5" />
              </a>
            </div>
          </div>
          <div className="border-t border-cream/20 md:contents md:border-0">
            {columns.map((c) => (
              <FooterColumn key={c.title} column={c} />
            ))}
          </div>
          <div className="space-y-4">
            <h2 className="caps text-[15px]">{t("footer.signup")}</h2>
            <p className="text-[14px] font-light text-cream/85">{t("footer.signupText")}</p>
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center gap-5 border-t border-cream/25 pt-6 md:flex-row md:justify-between">
          <div className="flex flex-col items-center gap-1 text-[12px] font-light text-cream/75 md:items-start">
            <span>{t("footer.rights")}</span>
            <span>
              {site.trade.name[locale]} · <bdi>{site.trade.cr}</bdi> · <bdi dir="ltr">{site.phoneDisplay}</bdi>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-cream/75">{t("footer.payWith")}</span>
            <PaymentMarks tone="dark" />
          </div>
        </div>
      </div>
    </footer>
  );
}
