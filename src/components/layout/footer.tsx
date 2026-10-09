import { getLocale, getTranslations } from "next-intl/server";
import { InstagramIcon, PaymentMarks, WhatsAppIcon } from "@/components/brand/brand-icons";
import { Logo } from "@/components/brand/logo";
import { ltr } from "@/components/content/values";
import { site, whatsappLink } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { formatKuwaitPhone } from "@/lib/phone";

const contactLink =
  "inline-flex min-h-11 items-center gap-2.5 text-[14px] font-light text-cream/90 underline-offset-4 transition-colors hover:text-cream hover:underline";

/**
 * Racing-green footer, one compact band at the client's request: the logo with the
 * legal line, Instagram and the WhatsApp number, and the accepted payment methods.
 * A single row from xl; stacked and centred below that.
 */
export async function Footer() {
  const t = await getTranslations("common");
  const locale = (await getLocale()) as Locale;
  const handle = `@${site.instagram.handle}`;
  // site.whatsapp is international ("965…"); show it the way the rest of the site writes numbers.
  const whatsappNumber = formatKuwaitPhone(site.whatsapp.replace(/^965/, ""));

  return (
    <footer className="bg-racing text-cream [&_:focus-visible]:outline-cream">
      <div className="mx-auto flex max-w-[1720px] flex-col items-center gap-5 px-6 py-8 xl:flex-row xl:justify-between xl:gap-10 xl:py-6">
        <div className="flex flex-col items-center gap-4 text-center xl:flex-row xl:gap-5 xl:text-start">
          <Logo variant="full" className="h-11 w-auto shrink-0 text-cream" title={t("brand")} />
          <div className="flex flex-col gap-0.5 text-[12px] leading-relaxed font-light text-cream/75">
            <span>{t("footer.rights")}</span>
            <span>
              {site.trade.name[locale]} · <bdi>{site.trade.cr}</bdi> · <bdi dir="ltr">{site.phoneDisplay}</bdi>
            </span>
          </div>
        </div>

        <ul className="flex flex-wrap items-center justify-center gap-x-8">
          <li>
            <a
              href={site.instagram.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Instagram ${handle}`}
              className={contactLink}
            >
              <InstagramIcon className="size-[18px]" />
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
              <WhatsAppIcon className="size-[18px]" />
              <bdi dir="ltr" className="figures">
                {whatsappNumber}
              </bdi>
            </a>
          </li>
        </ul>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <span className="text-[12px] text-cream/75">{t("footer.payWith")}</span>
          <PaymentMarks tone="dark" />
        </div>
      </div>
    </footer>
  );
}
