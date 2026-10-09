import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Reveal } from "@/components/ui/reveal";
import type { Notes } from "@/data/types";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

const TIERS = ["top", "heart", "base"] as const;
const COLUMNS = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3" } as const;

/**
 * Echoes the brand's Instagram notes graphics: the sand of the profile, black serif
 * type and the hourglass mark — top, heart and base side by side.
 */
export async function NotesBand({ notes, locale }: { notes: Notes; locale: Locale }) {
  const t = await getTranslations("product.notes");
  const tiers = TIERS.filter((tier) => notes[tier].length > 0);
  if (tiers.length === 0) return null;

  return (
    <section aria-labelledby="notes-title" className="bg-sand text-ink">
      <div className="mx-auto max-w-[1200px] px-6 py-20 text-center md:py-28">
        <span aria-hidden className="mx-auto block w-fit">
          <Logo variant="mark" title="" className="h-14 w-auto" />
        </span>
        <h2 id="notes-title" className="caps mt-6 font-serif text-title-sm font-medium md:text-title">
          {t("title")}
        </h2>
        <div
          className={cn(
            "mt-10 grid divide-y divide-ink/20 border-y border-ink/20 md:mt-14 md:divide-x md:divide-y-0 md:border-y-0",
            COLUMNS[tiers.length as 1 | 2 | 3],
          )}
        >
          {tiers.map((tier, i) => (
            <Reveal key={tier} index={i} className="px-4 py-8 md:px-10 md:py-3">
              <h3 className="caps text-[12px] font-medium text-ink/70">{t(tier)}</h3>
              <ul className="mt-4 space-y-1 font-serif text-[24px] leading-snug md:text-[28px]">
                {notes[tier].map((note) => (
                  <li key={note.en}>{note[locale]}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
