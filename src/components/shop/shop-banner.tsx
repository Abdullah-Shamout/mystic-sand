import { cn } from "@/lib/cn";
import { imageSource } from "@/lib/media";

// Where to anchor each crop so the bottles stay clear of the title.
const FOCUS: Record<string, string> = {
  "lifestyle/hourglass-candles": "50% 60%",
  "lifestyle/roses-iii": "50% 62%",
  "lifestyle/trio-basket": "50% 40%",
  "renders/dune": "50% 28%",
};

const focus = (key: string) => FOCUS[key] ?? "50% 50%";

/**
 * Collection banner (~50svh) with the title bottom-centred, Amouage style. Photos run
 * full-bleed with cream type. The studio renders (Body, Home) are light and centre the
 * bottle exactly where the title sits, so from md up they share the band with a sand
 * panel — the colour of their own backdrop, and of the brand's Instagram.
 */
export function ShopBanner({
  title,
  description,
  image,
}: {
  title: string;
  description: string;
  image: { desktop: string; mobile: string };
}) {
  const desktop = imageSource(image.desktop);
  const mobile = imageSource(image.mobile);
  const split = desktop.kind === "render";
  const sizes = split ? "(min-width: 768px) 50vw, 100vw" : "100vw";

  return (
    <section
      className={cn(
        "relative isolate h-[50svh] max-h-[640px] min-h-[340px] overflow-hidden bg-ink",
        split && "md:grid md:grid-cols-2 md:grid-rows-1 md:bg-sand",
      )}
    >
      <div className={cn("absolute inset-0", split && "md:relative md:order-2")}>
        <picture className="block h-full w-full">
          {image.desktop !== image.mobile && (
            <source
              media="(min-width: 768px)"
              srcSet={desktop.srcSet}
              sizes={sizes}
              width={desktop.width}
              height={desktop.height}
            />
          )}
          <img
            src={mobile.src}
            srcSet={mobile.srcSet}
            sizes={sizes}
            width={mobile.width}
            height={mobile.height}
            alt=""
            fetchPriority="high"
            className="h-full w-full object-cover object-[var(--focus-m)] md:object-[var(--focus-d)]"
            style={
              { "--focus-m": focus(image.mobile), "--focus-d": focus(image.desktop) } as React.CSSProperties
            }
          />
        </picture>
      </div>
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-ink/70 via-ink/25 to-transparent",
          split && "md:hidden",
        )}
      />
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-10 px-6 pb-9 text-center text-cream md:pb-12",
          split && "md:relative md:order-1 md:flex md:flex-col md:items-center md:justify-end md:text-ink",
        )}
      >
        <h1 className="caps font-serif text-[28px] leading-tight font-medium md:text-[36px]">{title}</h1>
        <p
          className={cn(
            "mx-auto mt-2 max-w-2xl text-[15px] leading-relaxed text-cream/90 md:text-[16px]",
            split && "md:text-ink/80",
          )}
        >
          {description}
        </p>
      </div>
    </section>
  );
}
