import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "light" | "outline-light" | "ghost" | "link";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  // Amouage swaps colours on hover (0.15s); we use British Racing Green as the primary.
  primary: "border border-racing bg-racing text-cream hover:bg-racing-deep hover:border-racing-deep",
  secondary: "border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper",
  light: "border border-paper bg-paper text-ink hover:bg-ink hover:border-ink hover:text-paper",
  "outline-light": "border border-cream bg-transparent text-cream hover:bg-cream hover:text-ink",
  ghost: "border border-transparent text-ink hover:bg-ink/5",
  link: "border-0 bg-transparent px-0 text-ink underline decoration-1 underline-offset-4 hover:decoration-2",
};

const sizes: Record<Size, string> = {
  sm: "h-11 px-4 text-[13px]",
  md: "h-[52px] px-6 text-[14px]",
  lg: "h-[60px] px-8 text-[15px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and ignores further clicks (prevents double submits). */
  busy?: boolean;
  asChild?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", busy = false, asChild = false, block = false, className, children, onClick, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      aria-busy={busy || undefined}
      onClick={busy ? (e) => e.preventDefault() : onClick}
      className={cn(
        "caps relative inline-flex select-none items-center justify-center gap-2 font-normal whitespace-nowrap transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-45 aria-busy:cursor-progress",
        variant !== "link" && sizes[size],
        variants[variant],
        block && "w-full",
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {busy && (
            <span
              aria-hidden
              className="absolute inset-0 m-auto size-5 animate-spin-slow rounded-full border-2 border-current border-t-transparent"
            />
          )}
          <span className={cn("inline-flex items-center gap-2", busy && "invisible")}>{children}</span>
        </>
      )}
    </Comp>
  );
});
