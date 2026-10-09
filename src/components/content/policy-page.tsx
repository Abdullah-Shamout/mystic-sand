import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { WhatsAppIcon } from "@/components/brand/brand-icons";
import { Button } from "@/components/ui/button";
import { site } from "@/data/site";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { defaultSettings, whatsappHref } from "@/lib/settings";
import { linkClass, richTags } from "./rich-tags";
import { storeValues } from "./values";

export type PolicyKey = "terms" | "privacy" | "refund" | "delivery";

const hrefs: Record<PolicyKey, string> = {
  terms: "/terms",
  privacy: "/privacy",
  refund: "/refund-policy",
  delivery: "/delivery",
};

// Message shape (messages/*/legal.json): each section body is a list of paragraphs,
// bullet lists and tables. Strings may use {storeValues} and rich tags (<returns>…).
type Block = string | { list: string[] } | { table: { head: string[]; rows: string[][] } };
type Section = { title: string; body: Block[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** Shared layout for Terms, Privacy, Returns and Delivery (required for KNET merchant approval). */
export async function PolicyPage({ policy, locale }: { policy: PolicyKey; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const sections = t.raw(`${policy}.sections`) as Record<string, Section>;
  const ids = Object.keys(sections);
  const whatsappText = t("shared.whatsappMessage");
  const values = { ...storeValues(locale), ...richTags(whatsappText) };
  const rich = (key: string) => t.rich(`${policy}.${key}`, values);

  const block = (id: string, item: Block, i: number) => {
    const key = `sections.${id}.body.${i}`;
    if (typeof item === "string") return <p key={i}>{rich(key)}</p>;
    if ("list" in item) {
      return (
        <ul key={i} className="list-disc space-y-2 ps-5 marker:text-muted">
          {item.list.map((_, j) => (
            <li key={j} className="ps-1">
              {rich(`${key}.list.${j}`)}
            </li>
          ))}
        </ul>
      );
    }
    return (
      <table key={i} className="w-full border-collapse text-[14px] leading-relaxed md:text-[15px]">
        <thead>
          <tr className="border-b border-ink/40">
            {item.table.head.map((_, k) => (
              <th key={k} scope="col" className="caps py-3 pe-4 text-start align-bottom text-[12px] font-medium text-muted">
                {rich(`${key}.table.head.${k}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {item.table.rows.map((row, r) => (
            <tr key={r} className="border-b border-line align-top">
              {row.map((_, c) =>
                c === 0 ? (
                  <th key={c} scope="row" className="py-4 pe-4 text-start font-medium text-ink">
                    {rich(`${key}.table.rows.${r}.${c}`)}
                  </th>
                ) : (
                  <td key={c} className="py-4 pe-4">
                    {rich(`${key}.table.rows.${r}.${c}`)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  const toc = (
    <ol className="mt-3 text-[14px]">
      {ids.map((id, n) => (
        <li key={id}>
          <a
            href={`#${id}`}
            className="flex min-h-11 items-baseline gap-3 py-2.5 leading-snug text-ink/75 transition-colors hover:text-ink lg:min-h-0 lg:py-1.5"
          >
            <span className="figures text-[12px] text-muted">{pad(n + 1)}</span>
            <span>{t(`${policy}.sections.${id}.title`)}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  const others = (Object.keys(hrefs) as PolicyKey[]).filter((k) => k !== policy);

  return (
    <article className="pb-24">
      <header className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center md:pt-20 md:pb-12">
        <p className="caps text-[13px] text-muted">{t(`${policy}.eyebrow`)}</p>
        <h1 className="caps mt-3 font-serif text-title-sm font-medium md:text-title">{t(`${policy}.title`)}</h1>
        <p className="mt-4 text-[14px] text-muted">{t("shared.lastUpdated", { date: t("shared.date") })}</p>
      </header>

      <div className="mx-auto max-w-[1200px] px-6">
        <aside
          role="note"
          aria-labelledby="policy-draft"
          className="mx-auto max-w-3xl border border-sand-deep/70 bg-sand/30 px-5 py-4 text-[14px] leading-relaxed lg:ms-[19rem] lg:me-0"
        >
          <p id="policy-draft" className="caps text-[13px] font-medium">
            {t("shared.draftTitle")}
          </p>
          <p className="mt-1 text-ink/80">{t("shared.draftText")}</p>
        </aside>

        <div className="mt-10 lg:mt-14 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
          <nav aria-label={t("shared.contents")} className="mx-auto mb-4 max-w-3xl lg:hidden">
            <details className="group border-y border-line">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-[15px] [&::-webkit-details-marker]:hidden">
                {t("shared.contents")}
                <Plus className="size-4 transition-transform group-open:rotate-45" strokeWidth={1.25} aria-hidden />
              </summary>
              <div className="pb-4">{toc}</div>
            </details>
          </nav>
          <nav aria-label={t("shared.contents")} className="hidden lg:sticky lg:top-40 lg:block lg:self-start">
            <p className="caps text-[13px] text-muted">{t("shared.contents")}</p>
            {toc}
          </nav>

          <div className="mx-auto max-w-3xl lg:mx-0">
            <p className="text-[17px] leading-[1.8]">{rich("intro")}</p>

            {ids.map((id, n) => (
              <section
                key={id}
                id={id}
                aria-labelledby={`${id}-title`}
                className="mt-12 scroll-mt-24 border-t border-line pt-10 lg:scroll-mt-28"
              >
                <h2 id={`${id}-title`} className="flex items-baseline gap-4 font-serif text-[23px] leading-snug font-medium md:text-[25px]">
                  <span className="figures font-sans text-[13px] font-normal text-muted">{pad(n + 1)}</span>
                  <span>{t(`${policy}.sections.${id}.title`)}</span>
                </h2>
                <div className="mt-5 space-y-4 text-[16px] leading-[1.8] text-ink/85">
                  {sections[id].body.map((item, i) => block(id, item, i))}
                </div>
              </section>
            ))}

            <section aria-labelledby="policy-questions" className="mt-16 bg-tile px-6 py-8 md:px-10 md:py-10">
              <h2 id="policy-questions" className="caps font-serif text-title-sm font-medium">
                {t("shared.questionsTitle")}
              </h2>
              <p className="mt-2 text-[15px] text-ink/80">{t("shared.questionsText")}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3">
                <Button asChild>
                  <a href={whatsappHref(defaultSettings, whatsappText)} target="_blank" rel="noreferrer">
                    <WhatsAppIcon className="size-4" />
                    {t("shared.whatsapp")}
                    <span className="sr-only">({t("shared.newTab")})</span>
                  </a>
                </Button>
                <a href={`mailto:${site.email}`} className={cn(linkClass, "inline-flex min-h-11 items-center text-[15px]")}>
                  <bdi dir="ltr">{site.email}</bdi>
                </a>
              </div>
            </section>

            <nav aria-labelledby="policy-related" className="mt-12">
              <h2 id="policy-related" className="caps text-[13px] text-muted">
                {t("shared.related")}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-x-8">
                {others.map((k) => (
                  <li key={k}>
                    <Link href={hrefs[k]} className={cn(linkClass, "inline-flex min-h-11 items-center text-[15px]")}>
                      {t(`${k}.title`)}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href="/faq" className={cn(linkClass, "inline-flex min-h-11 items-center text-[15px]")}>
                    {t("shared.faq")}
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </div>
    </article>
  );
}
