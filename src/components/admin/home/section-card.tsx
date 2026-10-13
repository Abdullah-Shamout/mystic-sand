"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { SectionId } from "@/lib/admin/home-drafts";
import { ConfirmDialog } from "../confirm-dialog";

/**
 * A numbered, collapsible card for one home-page section. The header shows the name, a one-line
 * summary and "Unsaved changes" / "Edited" badges; the body (the form) renders only when open; the
 * footer carries Save, Discard and Reset (with a confirm) plus the browser-only note.
 */
export function SectionCard({
  id,
  index,
  title,
  hint,
  summary,
  dirty,
  edited,
  open,
  errors,
  onToggle,
  onSave,
  onDiscard,
  onReset,
  children,
}: {
  id: SectionId;
  index: number;
  title: string;
  hint: string;
  summary: string;
  dirty: boolean;
  edited: boolean;
  open: boolean;
  errors: string[];
  onToggle: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const bodyId = useId();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <section data-testid={`home-section-${id}`} className="border border-line bg-paper">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          data-testid={`home-section-${id}-toggle`}
          className="flex w-full items-center gap-3 px-4 py-4 text-start transition-colors hover:bg-tile/40 sm:px-5"
        >
          <span className="figures flex size-7 shrink-0 items-center justify-center rounded-full border border-line text-[13px] font-medium text-muted">
            {index}
          </span>
          <span className="min-w-0 flex-1">
            <span className="caps block text-[14px] font-medium text-ink">{title}</span>
            {summary && (
              <span className="mt-0.5 block truncate text-[12px] text-muted">
                <bdi>{summary}</bdi>
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {dirty && (
              <span className="caps rounded-full bg-racing/10 px-2 py-0.5 text-[10px] font-medium text-racing">
                {t("homePage.unsaved")}
              </span>
            )}
            {edited && !dirty && (
              <span className="caps rounded-full bg-tile px-2 py-0.5 text-[10px] font-medium text-muted">
                {t("homePage.edited")}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      </h2>

      {open && (
        <div id={bodyId} className="border-t border-line px-4 py-5 sm:px-5">
          <p className="max-w-prose text-[13px] leading-relaxed text-muted">{hint}</p>
          {id !== "ticker" && (
            <p className="mb-5 mt-1 max-w-prose text-[12px] leading-relaxed text-muted">{t("homePage.emptyHint")}</p>
          )}
          {id === "ticker" && <div className="mb-5" />}

          {children}

          {errors.length > 0 && (
            <ul className="mt-4 space-y-1">
              {errors.map((key) => (
                <li key={key} className="text-[13px] text-danger">
                  {t(`homePage.errors.${key}`)}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-4">
            <Button type="button" size="sm" onClick={onSave} disabled={!dirty} data-testid={`home-${id}-save`}>
              {t("homePage.save")}
            </Button>
            {dirty && (
              <button
                type="button"
                onClick={onDiscard}
                className="caps text-[12px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
              >
                {t("homePage.discard")}
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={!edited && !dirty}
              data-testid={`home-${id}-reset`}
              className="caps text-[12px] text-muted underline underline-offset-4 transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
            >
              {t("homePage.reset")}
            </button>
            <p className="w-full text-[12px] leading-snug text-muted sm:ms-auto sm:w-auto">{t("homePage.browserNote")}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("homePage.resetTitle")}
        message={t("homePage.resetMessage")}
        confirmLabel={t("homePage.resetConfirm")}
        danger
        onConfirm={onReset}
      />
    </section>
  );
}
