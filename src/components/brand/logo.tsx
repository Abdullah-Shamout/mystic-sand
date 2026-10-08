import { cn } from "@/lib/cn";
import { LOGO_PATH, LOGO_VIEWBOX } from "./logo-path.generated";

/**
 * The Mystic Sand logo, traced from the client's artwork (scripts/trace-logo.mjs).
 * Variants crop the same path with different viewBoxes. Inherits currentColor.
 */
export function Logo({
  variant = "full",
  className,
  title = "Mystic Sand",
}: {
  variant?: keyof typeof LOGO_VIEWBOX;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={LOGO_VIEWBOX[variant]}
      role="img"
      aria-label={title}
      className={cn("block fill-current", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={LOGO_PATH} fillRule="evenodd" />
    </svg>
  );
}
