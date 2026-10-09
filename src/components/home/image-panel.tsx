import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type Props = {
  /** Image key for screens ≥768px (and all screens when `mobile` is not set). */
  image: string;
  /** Separate art for phones; only the visible one is fetched (lazy + display:none). */
  mobile?: string;
  alt: string;
  mobileAlt?: string;
  title: string;
  titleAs?: "h1" | "h2";
  eyebrow?: string;
  cta?: { href: string; label: string };
  /** Above the fold: load eagerly (use a single image, not `mobile`). */
  priority?: boolean;
  /** Heights — the panel itself never adds gaps. */
  className?: string;
  /** e.g. "object-[22%_50%]" to keep the subject in a portrait crop. */
  imageClassName?: string;
};

/** Amouage-style full-bleed panel: one headline bottom-centre in cream and one light button. */
export function ImagePanel({
  image,
  mobile,
  alt,
  mobileAlt,
  title,
  titleAs: Title = "h2",
  eyebrow,
  cta,
  priority = false,
  className,
  imageClassName,
}: Props) {
  return (
    <section className={cn("relative isolate overflow-hidden bg-ink text-cream [&_:focus-visible]:outline-cream", className)}>
      {mobile ? (
        <>
          <div className="absolute inset-0 md:hidden">
            <ResponsiveImage image={mobile} alt={mobileAlt ?? alt} sizes="100vw" className={imageClassName} />
          </div>
          <div className="absolute inset-0 hidden md:block">
            <ResponsiveImage image={image} alt={alt} sizes="100vw" />
          </div>
        </>
      ) : (
        <div className="absolute inset-0">
          <ResponsiveImage
            image={image}
            alt={alt}
            sizes="100vw"
            priority={priority}
            className={cn(imageClassName, "md:object-center")}
          />
        </div>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-ink/70 via-ink/25 to-transparent" />
      <Reveal className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-12 text-center md:pb-16">
        {eyebrow && <p className="caps mb-3 text-[12px] text-cream/85 md:text-[13px]">{eyebrow}</p>}
        <Title className="caps max-w-3xl font-serif text-[30px] leading-[1.1] font-medium text-balance md:text-[42px]">
          {title}
        </Title>
        {cta && (
          <Button asChild variant="light" className="mt-6 min-w-44 md:mt-7">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        )}
      </Reveal>
    </section>
  );
}
