"use client";

import { Sparkles, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useBag } from "@/store/bag";
import { useCheckout } from "@/store/checkout";
import { useUi } from "@/store/ui";
import { DEMO_FLAG } from "./url-actions";

export const DEMO_OUTCOME = "ms-demo-outcome";
export type DemoOutcome = "CAPTURED" | "NOT CAPTURED" | "CANCELED";

/** Sample shopper used by "Fill sample Kuwait address". */
export const SAMPLE_DETAILS = {
  name: "Noor Al-Ahmad",
  phone: "55500123",
  email: "",
  areaId: "salmiya",
  housing: "apartment",
  block: "10",
  street: "Salem Al-Mubarak St",
  avenue: "",
  building: "12",
  floor: "3",
  apartment: "7",
  mapsLink: "",
  notes: "",
} as const;

/** Event the checkout form listens to, to reload values from the checkout store. */
export const DRAFT_UPDATED_EVENT = "ms:draft-updated";

export function readDemoOutcome(): DemoOutcome {
  try {
    const v = sessionStorage.getItem(DEMO_OUTCOME);
    if (v === "NOT CAPTURED" || v === "CANCELED") return v;
  } catch {
    // storage blocked
  }
  return "CAPTURED";
}

/** Hidden presenter tools — enable with ?demo=1 (per browser session). */
export function DemoHelpers() {
  const t = useTranslations("common");
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<DemoOutcome>("CAPTURED");
  const updateDraft = useCheckout((s) => s.updateDraft);
  const pushToast = useUi((s) => s.pushToast);

  useEffect(() => {
    const sync = () => {
      try {
        setEnabled(sessionStorage.getItem(DEMO_FLAG) === "1");
      } catch {
        setEnabled(false);
      }
      setOutcome(readDemoOutcome());
    };
    sync();
    window.addEventListener("ms:demo-changed", sync);
    return () => window.removeEventListener("ms:demo-changed", sync);
  }, []);

  if (!enabled) return null;

  return (
    <div className="fixed start-3 bottom-3 z-[70] print:hidden">
      {open ? (
        <div className="w-72 border border-ink bg-paper p-4 text-ink shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="caps text-[12px] font-medium">{t("demo.title")}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("close")} className="size-8">
              <X className="mx-auto size-4" strokeWidth={1.25} />
            </button>
          </div>
          <div className="space-y-3 text-[14px]">
            <button
              type="button"
              className="w-full border border-ink px-3 py-2 text-start hover:bg-ink hover:text-paper"
              onClick={() => {
                updateDraft({ ...SAMPLE_DETAILS, housing: "apartment" });
                window.dispatchEvent(new Event(DRAFT_UPDATED_EVENT));
                pushToast({ title: t("demo.filled") });
              }}
            >
              {t("demo.fillAddress")}
            </button>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">{t("demo.outcome")}</span>
              <select
                value={outcome}
                onChange={(e) => {
                  const v = e.target.value as DemoOutcome;
                  setOutcome(v);
                  try {
                    sessionStorage.setItem(DEMO_OUTCOME, v);
                  } catch {
                    // storage blocked
                  }
                }}
                className="h-10 w-full border border-line bg-paper px-2"
              >
                <option value="CAPTURED">CAPTURED</option>
                <option value="NOT CAPTURED">NOT CAPTURED</option>
                <option value="CANCELED">CANCELED</option>
              </select>
            </label>
            <button
              type="button"
              className="w-full px-3 py-2 text-start text-danger underline underline-offset-4"
              onClick={() => {
                useBag.getState().clear();
                useCheckout.getState().resetAll();
                window.dispatchEvent(new Event(DRAFT_UPDATED_EVENT));
                pushToast({ title: t("demo.resetDone") });
              }}
            >
              {t("demo.reset")}
            </button>
            <button
              type="button"
              className="w-full px-3 py-1 text-start text-[12px] text-muted underline underline-offset-4"
              onClick={() => {
                try {
                  sessionStorage.removeItem(DEMO_FLAG);
                } catch {
                  // storage blocked
                }
                setEnabled(false);
              }}
            >
              {t("demo.hide")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="caps inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[11px] text-paper"
        >
          <Sparkles className="size-3.5" strokeWidth={1.5} aria-hidden />
          {t("demo.label")}
        </button>
      )}
    </div>
  );
}
