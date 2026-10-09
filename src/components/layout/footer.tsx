import { getLocale, getTranslations } from "next-intl/server";
import { InstagramIcon, PaymentMarks, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Logo } from "@/components/brand/logo";
import { ltr } from "@/components/content/values";
import { site, whatsappLink } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatKuwaitPhone } from "@/lib/phone";

const contactLink =
  "inline-flex min-h-11 items-center gap-3 text-[15px] font-light text-cream/90 underline-offset-4 transition-colors hover:text-cream hover:underline";

/**
 * Racing-green footer, kept minimal at the client's request: the logo, Instagram and
 * the WhatsApp number, then the legal line and the accepted payment methods.
 */
export async function Footer() {
  const t = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const handle = `@${site.instagram.handle}`;
  // site.whatsapp is international ("965…"); show it the way the rest of the site writes numbers.
  const whatsappNumber = formatKuwaitPhone(site.whatsapp.replace(/^965/, ""));

  return (
    <footer className="bg-racing text-cream [&_:focus-visible]:outline-cream">
      <div className="mx-auto max-w-[1720px] px-6 pt-16 pb-6 md:pt-20">
        <div className="flex flex-col items-center gap-8 text-center">
          <Logo variant="full" className="h-20 w-auto text-cream md:h-24" title={t("brand")} />
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-1">
            <li>
              <a
                href={site.instagram.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Instagram ${handle}`}
                className={contactLink}
              >
                <InstagramIcon className="size-5" />
                <bdi dir="ltr">{handle}</bdi>
              </a>
            </li>
            <li>
              <a
                href={whatsappLink(t("brand"))}
                target="_blank"
                rel="noreferrer"
                aria-label={`${t("footer.whatsapp")} ${ltr(whatsappNumber)}`}
                className={contactLink}
              >
                <WhatsAppIcon className="size-5" />
                <bdi dir="ltr" className="figures">
                  {whatsappNumber}
                </bdi>
              </a>
            </li>
          </ul>
        </div>

        <div className="mt-14 flex flex-col items-center gap-5 border-t border-cream/25 pt-6 md:flex-row md:justify-between">
          <div className="flex flex-col items-center gap-1 text-center text-[12px] font-light text-cream/75 md:items-start md:text-start">
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
