import type { ReactNode } from "react";
import { TelAnchor, WhatsAppAnchor } from "@/components/settings/live";
import { site } from "@/data/site";
import { Link } from "@/i18n/navigation";

export const linkClass = "underline decoration-1 underline-offset-4 hover:decoration-2";

type Tag = (chunks: ReactNode) => ReactNode;

function internalLink(href: string, chunks: ReactNode) {
  return (
    <Link href={href} className={linkClass}>
      {chunks}
    </Link>
  );
}

function externalLink(href: string, chunks: ReactNode) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {chunks}
    </a>
  );
}

/**
 * Tags available in rich content and legal messages (rendered with t.rich), e.g.
 * "Read our <delivery>delivery policy</delivery>" or "<en>I</en>" for Latin product names.
 * Tag names must not collide with value names: ICU looks both up in one object, which is
 * why the phone link is <tel>{phone}</tel> and the email link <mail>{email}</mail>.
 */
export function richTags(whatsappText: string): Record<string, Tag> {
  return {
    b: (chunks) => <strong className="font-medium text-ink">{chunks}</strong>,
    en: (chunks) => <bdi lang="en">{chunks}</bdi>,
    contact: (chunks) => internalLink("/contact", chunks),
    faq: (chunks) => internalLink("/faq", chunks),
    payment: (chunks) => internalLink("/faq#payment", chunks),
    delivery: (chunks) => internalLink("/delivery", chunks),
    returns: (chunks) => internalLink("/refund-policy", chunks),
    privacy: (chunks) => internalLink("/privacy", chunks),
    terms: (chunks) => internalLink("/terms", chunks),
    orders: (chunks) => internalLink("/orders", chunks),
    shop: (chunks) => internalLink("/shop", chunks),
    whatsapp: (chunks) => (
      <WhatsAppAnchor text={whatsappText} target="_blank" rel="noreferrer" className={linkClass}>
        {chunks}
      </WhatsAppAnchor>
    ),
    instagram: (chunks) => externalLink(site.instagram.url, chunks),
    tel: (chunks) => (
      <TelAnchor dir="ltr" className={linkClass}>
        {chunks}
      </TelAnchor>
    ),
    mail: (chunks) => (
      <a href={`mailto:${site.email}`} className={linkClass}>
        {chunks}
      </a>
    ),
  };
}
