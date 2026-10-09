import { Reveal } from "@/components/ui/reveal";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import { cn } from "@/lib/cn";

/**
 * Half image, half text panel. Image above the text on phones; side by side from 768px,
 * full viewport height on desktop. `imageSide` is logical, so it mirrors in Arabic.
 */
export function SplitPanel({
  image,
  alt,
  imageSide = "start",
  className,
  labelledBy,
  children,
}: {
  image: string;
  alt: string;
  imageSide?: "start" | "end";
  /** Background and text colour of the panel. */
  className?: string;
  labelledBy?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={labelledBy} className={cn("grid md:grid-cols-2", className)}>
      <div
        className={cn(
          "relative aspect-square overflow-hidden md:aspect-auto md:min-h-[600px] lg:min-h-[calc(100svh-129px)]",
          imageSide === "end" && "md:order-last",
        )}
      >
        <ResponsiveImage image={image} alt={alt} sizes="(min-width: 768px) 50vw, 100vw" className="absolute inset-0" />
      </div>
      <Reveal className="flex flex-col items-center justify-center px-6 py-16 text-center md:px-10 md:py-20 lg:px-16">
        {children}
      </Reveal>
    </section>
  );
}
