import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/cn";

/**
 * Editorial chapter: media on one half, text on the other (stacked on phones).
 * `mediaSide` is logical, so alternating chapters mirror correctly in Arabic.
 */
export function StoryChapter({
  id,
  number,
  title,
  media,
  mediaSide = "start",
  mediaClassName,
  footer,
  children,
}: {
  /** Id of the chapter heading. */
  id: string;
  number: string;
  title: string;
  media: React.ReactNode;
  mediaSide?: "start" | "end";
  /** Background behind the media (packshots blend into it). */
  mediaClassName?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="grid md:grid-cols-2">
      <div
        className={cn(
          "relative aspect-square overflow-hidden md:aspect-auto md:min-h-[560px] lg:min-h-[680px]",
          mediaSide === "end" && "md:order-last",
          mediaClassName,
        )}
      >
        {media}
      </div>
      <Reveal className="flex flex-col justify-center px-6 py-16 md:px-12 md:py-20 lg:px-20 xl:px-28">
        <p aria-hidden className="flex items-center gap-4 text-[13px] text-muted">
          <span className="figures">{number}</span>
          <span className="h-px w-12 bg-ink/25" />
        </p>
        <h2 id={id} className="caps mt-5 font-serif text-title-sm font-medium md:text-title">
          {title}
        </h2>
        <div className="mt-6 max-w-lg space-y-5 text-[16px] leading-[1.8] text-ink/85">{children}</div>
        {footer && <div className="mt-9">{footer}</div>}
      </Reveal>
    </section>
  );
}
