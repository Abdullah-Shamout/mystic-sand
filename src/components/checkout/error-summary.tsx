"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { anchorId, focusField, type FieldName } from "./form-helpers";

/** Shown after an invalid Pay tap: every problem, each linking to its field. */
export function ErrorSummary({ items }: { items: Array<{ name: FieldName; message: string }> }) {
  const t = useTranslations("checkout.errors");
  return (
    <div className="mt-8 border border-danger/40 bg-danger/[0.04] p-5" data-testid="error-summary">
      <p className="flex items-center gap-2 text-[15px] font-medium text-danger">
        <CircleAlert className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
        {t("summary", { count: items.length })}
      </p>
      <ul className="mt-3 space-y-1 ps-[26px] text-[14px]">
        {items.map(({ name, message }) => (
          <li key={name}>
            <a
              href={`#${anchorId(name)}`}
              onClick={(e) => {
                e.preventDefault();
                focusField(name);
              }}
              className="inline-block py-0.5 underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
