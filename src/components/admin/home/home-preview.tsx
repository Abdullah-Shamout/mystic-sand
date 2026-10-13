"use client";

import { Monitor, RotateCcw, Smartphone, SquareArrowOutUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import type { SectionId } from "@/lib/admin/home-drafts";
import { BASE_PATH } from "@/lib/asset";
import { cn } from "@/lib/cn";

const DEVICES = {
  desktop: { w: 1280, h: 800 },
  phone: { w: 390, h: 844 },
} as const;

type Device = keyof typeof DEVICES;

/** Space kept under the stage for the "Updates when you save" note. */
const NOTE_RESERVE = 44;

/**
 * A live, scaled iframe of the storefront home page beside the editor. Saves reach it through the
 * storage event (its own StorageSync rehydrates ms-home / ms-settings), so it never reloads. It
 * scrolls to the open section, blocks clicks/links inside, and fits itself to the visible area.
 */
export function HomePreview({ open, saveTick }: { open: SectionId; saveTick: number }) {
  const t = useTranslations("admin");
  const adminLocale = useLocale() as Locale;
  const [device, setDevice] = useState<Device>("desktop");
  const [lang, setLang] = useState<Locale>(adminLocale);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  const [metrics, setMetrics] = useState({ w: 0, availH: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Measure the stage width and the height visible below it (re-run on resize + scroll; setState
  // only inside these callbacks). The stage's top shifts as the page scrolls until the sticky engages.
  const measure = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const w = el.clientWidth;
    const availH = Math.max(0, window.innerHeight - rect.top - NOTE_RESERVE);
    setMetrics((m) => (m.w === w && m.availH === availH ? m : { w, availH }));
  }, []);

  useEffect(() => {
    measure();
    const el = stageRef.current;
    const ro = new ResizeObserver(() => measure());
    if (el) ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, [measure]);

  const d = DEVICES[device];
  // Computer: width-driven (so no empty grey gap under the frame). Phone: fit the visible height.
  const scale =
    device === "desktop"
      ? Math.min(1, metrics.w / d.w) || 0
      : Math.min(1, metrics.w / d.w, metrics.availH / d.h) || 0;
  const stageH = d.h * scale;
  const left = (metrics.w - d.w * scale) / 2; // physical left centres the frame (works in RTL too)

  // Scrolls the frame to a section. Reads only the ref (never during render), so it is stable.
  const scrollToOpen = useCallback((id: SectionId) => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    if (!win || !doc) return;
    let top = 0;
    if (id !== "ticker") {
      const el = doc.querySelector(`[data-home-section="${id}"]`);
      if (el) {
        const headerH = (doc.querySelector("header") as HTMLElement | null)?.offsetHeight ?? 0;
        top = el.getBoundingClientRect().top + win.scrollY - headerH;
      }
    }
    win.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }, []);

  // Re-scroll whenever the open section, a save, the device, or a (re)load changes. loadTick's change
  // also cancels any stale timer from a previous load.
  useEffect(() => {
    const now = setTimeout(() => scrollToOpen(open), 0);
    const later = setTimeout(() => scrollToOpen(open), 400);
    return () => {
      clearTimeout(now);
      clearTimeout(later);
    };
  }, [open, saveTick, device, loadTick, scrollToOpen]);

  const remount = () => {
    setLoaded(false);
    setReloadKey((n) => n + 1);
  };
  const switchLang = (next: Locale) => {
    if (next === lang) return;
    setLoaded(false);
    setLang(next);
  };

  // On load: neutralise reveal animations, hide the frame scrollbar, block clicks/submits, and scroll.
  const onLoad = () => {
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    const doc = frame?.contentDocument;
    setLoaded(true);
    setLoadTick((n) => n + 1);
    if (!win || !doc) return;

    try {
      const style = doc.createElement("style");
      style.textContent =
        ".reveal[data-state]{opacity:1!important;transform:none!important;transition:none!important}" +
        "html{overscroll-behavior:contain;scrollbar-width:none}html::-webkit-scrollbar{display:none}";
      doc.head.appendChild(style);
    } catch {
      // ignore
    }

    // Duck-typed closest: instanceof fails across realms, so test for the method instead.
    const block = (event: Event) => {
      const target = event.target as { closest?: (sel: string) => unknown } | null;
      if (target && typeof target.closest === "function" && target.closest("a,button,[role=button],label,summary")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    win.addEventListener("click", block, true);
    win.addEventListener("submit", block, true);
  };

  const storeUrl = `${BASE_PATH}/${lang}/`;

  return (
    <div className="sticky top-[7.75rem] flex flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3">
        <div className="inline-flex overflow-hidden rounded-full border border-line">
          <ToolbarToggle active={device === "desktop"} onClick={() => setDevice("desktop")} label={t("homePage.preview.desktop")} testId="home-preview-desktop" icon={Monitor} />
          <ToolbarToggle active={device === "phone"} onClick={() => setDevice("phone")} label={t("homePage.preview.phone")} testId="home-preview-phone" icon={Smartphone} />
        </div>
        <div className="inline-flex overflow-hidden rounded-full border border-line">
          <ToolbarToggle active={lang === "en"} onClick={() => switchLang("en")} label={t("homePage.preview.english")} />
          <ToolbarToggle active={lang === "ar"} onClick={() => switchLang("ar")} label={t("homePage.preview.arabic")} />
        </div>
        <div className="ms-auto flex items-center gap-1">
          <button
            type="button"
            onClick={remount}
            aria-label={t("homePage.preview.reload")}
            className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
          <a
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("homePage.preview.open")}
            className="inline-flex size-9 items-center justify-center text-muted transition-colors hover:text-ink"
          >
            <SquareArrowOutUpRight className="size-4" strokeWidth={1.5} aria-hidden />
          </a>
        </div>
      </div>

      <div ref={stageRef} data-testid="home-preview-stage" className="relative mt-3 overflow-hidden bg-tile" style={{ height: stageH }}>
        {metrics.w > 0 && (
          <iframe
            key={`${lang}-${reloadKey}`}
            ref={frameRef}
            src={storeUrl}
            title={t("homePage.preview.frameTitle")}
            data-testid="home-preview-frame"
            onLoad={onLoad}
            style={{
              position: "absolute",
              left,
              top: 0,
              width: d.w,
              height: d.h,
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
              border: 0,
              background: "white",
            }}
          />
        )}
        {/* Until the frame fires load, a transparent overlay stops a click reaching an un-blocked link. */}
        {!loaded && <div className="absolute inset-0 z-10 cursor-wait bg-tile/40" aria-hidden />}
      </div>

      <p className="pt-2 text-[12px] text-muted">{t("homePage.preview.note")}</p>
    </div>
  );
}

function ToolbarToggle({
  active,
  onClick,
  label,
  testId,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  testId?: string;
  icon?: typeof Monitor;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "caps inline-flex min-h-9 items-center gap-1.5 px-3 text-[12px] transition-colors",
        active ? "bg-ink text-paper" : "text-muted hover:text-ink",
      )}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={1.5} aria-hidden />}
      {label}
    </button>
  );
}
