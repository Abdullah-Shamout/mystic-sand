"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useUi } from "@/store/ui";

/** Mock signup (no backend): confirms in place and announces to screen readers. */
export function NewsletterForm({ variant = "footer" }: { variant?: "footer" | "band" }) {
  const t = useTranslations("common");
  const announce = useUi((s) => s.announce);
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");

  if (done) {
    return (
      <p className={cn("text-[15px]", variant === "footer" ? "text-cream" : "text-ink")} role="status">
        {t("footer.subscribed")}
      </p>
    );
  }

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.includes("@")) return;
        setDone(true);
        announce(t("footer.subscribed"));
      }}
    >
      <label className="sr-only" htmlFor={`newsletter-${variant}`}>
        {t("footer.email")}
      </label>
      {variant === "footer" ? (
        <div className="flex flex-col gap-3">
          <input
            id={`newsletter-${variant}`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("footer.email")}
            autoComplete="email"
            className="h-[50px] w-full border border-cream/70 bg-transparent px-4 text-cream outline-none placeholder:text-cream/60 focus:border-cream"
          />
          <button
            type="submit"
            className="caps h-[50px] w-full border border-cream bg-cream text-[14px] text-ink transition-colors hover:bg-transparent hover:text-cream"
          >
            {t("footer.subscribe")}
          </button>
        </div>
      ) : (
        <div className="flex items-center border-b border-ink">
          <input
            id={`newsletter-${variant}`}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("footer.email")}
            autoComplete="email"
            className="h-12 w-full bg-transparent text-[16px] outline-none placeholder:text-ink/60"
          />
          <button type="submit" className="inline-flex size-11 items-center justify-center" aria-label={t("footer.subscribe")}>
            <ArrowRight className="size-5 rtl:-scale-x-100" strokeWidth={1.25} />
          </button>
        </div>
      )}
    </form>
  );
}
