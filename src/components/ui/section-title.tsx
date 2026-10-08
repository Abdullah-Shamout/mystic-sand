import { cn } from "@/lib/cn";

/** Amouage's centred title band: generous space above, title, optional line. */
export function SectionTitle({
  title,
  subtitle,
  className,
  as: Tag = "h2",
}: {
  title: string;
  subtitle?: string;
  className?: string;
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("mx-auto max-w-3xl px-6 pt-20 pb-12 text-center md:pt-24 md:pb-14", className)}>
      <Tag className="caps font-serif text-title-sm font-medium md:text-title">{title}</Tag>
      {subtitle && <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">{subtitle}</p>}
    </div>
  );
}
