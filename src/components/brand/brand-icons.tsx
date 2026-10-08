import { siApplepay, siInstagram, siMastercard, siVisa, siWhatsapp } from "simple-icons";
import { cn } from "@/lib/cn";

// lucide-react 1.x ships no brand icons; these paths come from Simple Icons.
type SimpleIcon = { path: string; title: string };

function SimpleIconSvg({ icon, className, label }: { icon: SimpleIcon; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("fill-current", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={icon.path} />
    </svg>
  );
}

export const InstagramIcon = (p: { className?: string; label?: string }) => <SimpleIconSvg icon={siInstagram} {...p} />;
export const WhatsAppIcon = (p: { className?: string; label?: string }) => <SimpleIconSvg icon={siWhatsapp} {...p} />;
/** Apple Pay mark for black "Pay with Apple Pay" buttons (inherits currentColor). */
export const ApplePayLogo = (p: { className?: string; label?: string }) => (
  <SimpleIconSvg icon={siApplepay} className={cn("h-11 w-auto", p.className)} label={p.label ?? "Apple Pay"} />
);

/** Payment marks: KNET as a neutral text badge (official artwork comes from the acquiring bank). */
export function PaymentMarks({
  className,
  tone = "light",
  methods = ["knet", "applepay", "visa", "mastercard"],
}: {
  className?: string;
  tone?: "light" | "dark";
  methods?: Array<"knet" | "applepay" | "visa" | "mastercard">;
}) {
  const box = cn(
    "inline-flex h-7 min-w-11 items-center justify-center rounded-[3px] border px-1.5",
    tone === "dark" ? "border-cream/30 bg-cream text-ink" : "border-line bg-paper text-ink",
  );
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="KNET, Apple Pay, Visa, Mastercard">
      {methods.includes("knet") && (
        <li className={box}>
          <span className="text-[10px] font-semibold tracking-[0.12em]">KNET</span>
        </li>
      )}
      {methods.includes("applepay") && (
        <li className={box}>
          <SimpleIconSvg icon={siApplepay} className="h-[18px] w-auto" label="Apple Pay" />
        </li>
      )}
      {methods.includes("visa") && (
        <li className={box}>
          <SimpleIconSvg icon={siVisa} className="h-3 w-auto text-[#1A1F71]" label="Visa" />
        </li>
      )}
      {methods.includes("mastercard") && (
        <li className={box}>
          <svg viewBox="0 0 32 20" className="h-4 w-auto" role="img" aria-label={siMastercard.title}>
            <circle cx="12" cy="10" r="7" fill="#EB001B" />
            <circle cx="20" cy="10" r="7" fill="#F79E1B" />
            <path d="M16 4.3a7 7 0 0 1 0 11.4a7 7 0 0 1 0-11.4z" fill="#FF5F00" />
          </svg>
        </li>
      )}
    </ul>
  );
}
