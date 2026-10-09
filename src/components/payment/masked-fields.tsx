import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Read-only stand-ins for the fields of the bank's hosted page. Deliberately not
 * inputs: this public demo never collects card numbers, PINs or codes.
 */
export function MaskedFields({ fields }: { fields: Array<{ label: string; value: string; wide?: boolean }> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
      {fields.map((f) => (
        <div key={f.label} className={cn("min-w-0", f.wide ? "col-span-2" : "col-span-1")}>
          <dt className="text-[13px] text-muted">{f.label}</dt>
          <dd className="mt-1.5 flex h-12 items-center justify-between gap-2 border border-dashed border-ink/30 bg-paper px-3.5 text-muted">
            <bdi dir="ltr" className="figures truncate text-[16px]">
              {f.value}
            </bdi>
            <Lock className="size-3.5 shrink-0 opacity-60" strokeWidth={1.5} aria-hidden />
          </dd>
        </div>
      ))}
    </dl>
  );
}
