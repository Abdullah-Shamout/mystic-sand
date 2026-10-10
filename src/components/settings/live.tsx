"use client";

import { useLocale } from "next-intl";
import { type AnchorHTMLAttributes, forwardRef } from "react";
import type { Locale } from "@/i18n/routing";
import { useLiveSettings } from "@/lib/live";
import { isolatedKWD } from "@/lib/money";
import { feeFor, phoneDisplay, telHref, whatsappDisplay, whatsappHref } from "@/lib/settings";

// Live store settings rendered on screen. Each piece shows the default value during SSR and
// hydration (useLiveSettings returns the defaults until mounted), then the admin's live value.
// Defined here rather than imported from values so settings/content don't depend on each other.
const ltrIsolate = (text: string) => `⁦${text}⁩`;

/** Delivery fee, formatted KWD (isolated for use as text). */
export function LiveFee() {
  const settings = useLiveSettings();
  const locale = useLocale() as Locale;
  return <>{isolatedKWD(feeFor(settings), locale)}</>;
}

/** Contact phone, e.g. "+965 9000 0000". `isolate` wraps it in an LTR isolate for Arabic text. */
export function LivePhone({ isolate = false }: { isolate?: boolean }) {
  const settings = useLiveSettings();
  const display = phoneDisplay(settings);
  return <>{isolate ? ltrIsolate(display) : display}</>;
}

/** WhatsApp number written the way the site writes numbers, e.g. "+965 9000 0000". */
export function LiveWhatsAppNumber() {
  const settings = useLiveSettings();
  return <>{whatsappDisplay(settings)}</>;
}

type WhatsAppAnchorProps = { text: string } & AnchorHTMLAttributes<HTMLAnchorElement>;

/** WhatsApp link with the live wa.me href. Works as a Button `asChild` child (forwards ref/props). */
export const WhatsAppAnchor = forwardRef<HTMLAnchorElement, WhatsAppAnchorProps>(function WhatsAppAnchor(
  { text, children, ...props },
  ref,
) {
  const settings = useLiveSettings();
  return (
    <a ref={ref} href={whatsappHref(settings, text)} {...props}>
      {children}
    </a>
  );
});

/** "tel:" link with the live phone. Works as a Button `asChild` child (forwards ref/props). */
export const TelAnchor = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function TelAnchor(
  { children, ...props },
  ref,
) {
  const settings = useLiveSettings();
  return (
    <a ref={ref} href={telHref(settings)} {...props}>
      {children}
    </a>
  );
});
