"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import {
  draftToOverrides,
  ORDER,
  summary,
  toDrafts,
  validateDraft,
  type HomeDrafts,
  type SectionId,
} from "@/lib/admin/home-drafts";
import { useMediaQuery, useMounted } from "@/lib/hooks";
import { useLiveCatalog } from "@/lib/live";
import { cleanTickerList, resolveSettings, TICKER_CHARS } from "@/lib/settings";
import { STORAGE_FULL_EVENT } from "@/lib/storage";
import { useHomeStore } from "@/store/home";
import { useSettingsStore } from "@/store/settings";
import { useUi } from "@/store/ui";

/** sessionStorage key holding the drafts of unsaved sections (so a tab click / language switch keeps them). */
const DRAFTS_KEY = "ms-home-drafts";

/** Runs a store write and reports whether a storage-full event fired synchronously during it. */
function runDetectingFull(fn: () => void): boolean {
  let full = false;
  const onFull = () => {
    full = true;
  };
  window.addEventListener(STORAGE_FULL_EVENT, onFull);
  try {
    fn();
  } finally {
    window.removeEventListener(STORAGE_FULL_EVENT, onFull);
  }
  return full;
}

/** Merges a (possibly stale/invalid) saved draft onto a known-good base, keeping the base's shape. */
function reconcileDraft<T>(base: T, saved: unknown): T {
  if (typeof base === "string") return (typeof saved === "string" ? saved : base) as T;
  if (Array.isArray(base)) {
    if (!Array.isArray(saved)) return base;
    if (base.every((x) => typeof x === "string")) {
      return (saved.every((x) => typeof x === "string") ? saved : base) as T;
    }
    return base.map((b, i) => reconcileDraft(b, (saved as unknown[])[i])) as T;
  }
  if (base && typeof base === "object") {
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return base;
    const s = saved as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(base as Record<string, unknown>)) {
      out[k] = reconcileDraft((base as Record<string, unknown>)[k], s[k]);
    }
    return out as T;
  }
  return base;
}
import { ConfirmDialog } from "../confirm-dialog";
import { HomePreview } from "./home-preview";
import { SectionCard } from "./section-card";
import {
  DuoForm,
  FeatureForm,
  FilmForm,
  HeroForm,
  InstagramForm,
  ProductRowForm,
  ServicesForm,
  StoryForm,
} from "./section-forms";
import { TickerForm } from "./ticker-form";

/** The admin "Home page" editor. A skeleton until mounted (data is browser-only). */
export function HomeEditor() {
  const mounted = useMounted();
  if (!mounted) return <HomeEditorSkeleton />;
  return <HomeEditorLoaded />;
}

function HomeEditorLoaded() {
  const t = useTranslations("admin");
  const locale = useLocale() as Locale;
  const catalog = useLiveCatalog();
  const pushToast = useUi((s) => s.pushToast);

  // Subscribed store values drive the baseline (and recompute after a save or a cross-tab change).
  const storeOverrides = useHomeStore((s) => s.overrides);
  const settingsOverrides = useSettingsStore((s) => s.overrides);
  const ticker = useMemo(() => resolveSettings(settingsOverrides).ticker, [settingsOverrides]);
  const baseline = useMemo(() => toDrafts(storeOverrides, ticker), [storeOverrides, ticker]);

  // The editable drafts live here (lazy-initialised from the store, with any unsaved drafts restored).
  const [drafts, setDrafts] = useState<HomeDrafts>(() => {
    const base = toDrafts(useHomeStore.getState().overrides, resolveSettings(useSettingsStore.getState().overrides).ticker);
    try {
      const raw = sessionStorage.getItem(DRAFTS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, unknown>;
        const b = base as Record<SectionId, unknown>;
        for (const id of ORDER) {
          if (saved[id] !== undefined) b[id] = reconcileDraft(b[id], saved[id]);
        }
      }
    } catch {
      // ignore malformed restore data — the store-derived base is already correct
    }
    return base;
  });
  const [open, setOpen] = useState<SectionId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<SectionId, string[]>>>({});
  const [saveTick, setSaveTick] = useState(0);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  const wide = useMediaQuery("(min-width: 1280px)");

  const dirty = (id: SectionId) => JSON.stringify(drafts[id]) !== JSON.stringify(baseline[id]);
  const edited = (id: SectionId) =>
    id === "ticker" ? ticker.en.length > 0 || ticker.ar.length > 0 : storeOverrides[id] !== undefined;
  const anyDirty = ORDER.some((id) => dirty(id));

  // When the store's baseline changes (e.g. another tab saved), adopt it for any section the user
  // hasn't touched; keep the drafts of sections edited against the previous baseline.
  const prevBaselineRef = useRef(baseline);
  useEffect(() => {
    if (prevBaselineRef.current === baseline) return;
    const prev = prevBaselineRef.current;
    prevBaselineRef.current = baseline;
    setDrafts((cur) => {
      let changed = false;
      const next: HomeDrafts = { ...cur };
      const n = next as Record<SectionId, unknown>;
      for (const id of ORDER) {
        if (JSON.stringify(cur[id]) === JSON.stringify(prev[id])) {
          n[id] = baseline[id];
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [baseline]);

  // Keep the drafts of unsaved sections in sessionStorage; clear them once nothing is dirty.
  useEffect(() => {
    try {
      const unsaved: Partial<Record<SectionId, HomeDrafts[SectionId]>> = {};
      for (const id of ORDER) {
        if (JSON.stringify(drafts[id]) !== JSON.stringify(baseline[id])) unsaved[id] = drafts[id];
      }
      if (Object.keys(unsaved).length > 0) sessionStorage.setItem(DRAFTS_KEY, JSON.stringify(unsaved));
      else sessionStorage.removeItem(DRAFTS_KEY);
    } catch {
      // storage blocked
    }
  }, [drafts, baseline]);

  // Warn before leaving with unsaved changes (copied from the product editor).
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const updateDraft = <K extends SectionId>(id: K, patch: Partial<HomeDrafts[K]>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const save = (id: SectionId) => {
    if (id === "ticker") {
      // A message over the limit is blocked rather than silently dropped on save.
      const tooLong = [...drafts.ticker.en, ...drafts.ticker.ar].some((m) => m.trim().length > TICKER_CHARS);
      if (tooLong) {
        setErrors((e) => ({ ...e, ticker: ["tooLong"] }));
        return;
      }
      setErrors((e) => ({ ...e, ticker: [] }));
      const cleaned = { en: cleanTickerList(drafts.ticker.en), ar: cleanTickerList(drafts.ticker.ar) };
      const full = runDetectingFull(() => useSettingsStore.getState().setOverrides({ ticker: cleaned }));
      if (full) {
        void useSettingsStore.persist.rehydrate(); // revert in-memory to what was actually stored
        return;
      }
      setDrafts((prev) => ({ ...prev, ticker: cleaned }));
    } else {
      const errs = validateDraft(id, drafts[id]);
      if (errs.length > 0) {
        setErrors((e) => ({ ...e, [id]: errs }));
        return;
      }
      setErrors((e) => ({ ...e, [id]: [] }));
      const full = runDetectingFull(() =>
        useHomeStore.getState().saveSection(id, draftToOverrides(id, drafts[id], catalog)),
      );
      if (full) {
        void useHomeStore.persist.rehydrate();
        return;
      }
      const saved = toDrafts(useHomeStore.getState().overrides, ticker);
      setDrafts((prev) => ({ ...prev, [id]: saved[id] }));
    }
    pushToast({ title: t("homePage.saved") });
    setSaveTick((n) => n + 1);
  };

  const discard = (id: SectionId) => {
    setDrafts((prev) => ({ ...prev, [id]: baseline[id] }));
    setErrors((e) => ({ ...e, [id]: [] }));
  };

  const resetSection = (id: SectionId) => {
    if (id === "ticker") {
      useSettingsStore.getState().setOverrides({ ticker: { en: [], ar: [] } });
      setDrafts((prev) => ({ ...prev, ticker: { en: [], ar: [] } }));
    } else {
      useHomeStore.getState().resetSection(id);
      const saved = toDrafts(useHomeStore.getState().overrides, ticker);
      setDrafts((prev) => ({ ...prev, [id]: saved[id] }));
    }
    setErrors((e) => ({ ...e, [id]: [] }));
    pushToast({ title: t("homePage.resetDone") });
    setSaveTick((n) => n + 1);
  };

  const resetAll = () => {
    useHomeStore.getState().resetAll();
    useSettingsStore.getState().setOverrides({ ticker: { en: [], ar: [] } });
    setDrafts(toDrafts({}, { en: [], ar: [] }));
    setErrors({});
    pushToast({ title: t("homePage.resetAllDone") });
    setSaveTick((n) => n + 1);
  };

  const renderForm = (id: SectionId) => {
    switch (id) {
      case "ticker":
        return <TickerForm draft={drafts.ticker} onChange={(p) => updateDraft("ticker", p)} />;
      case "hero":
        return <HeroForm draft={drafts.hero} onChange={(p) => updateDraft("hero", p)} catalog={catalog} locale={locale} />;
      case "trilogy":
        return <ProductRowForm section="trilogy" draft={drafts.trilogy} onChange={(p) => updateDraft("trilogy", p)} catalog={catalog} locale={locale} />;
      case "story":
        return <StoryForm draft={drafts.story} onChange={(p) => updateDraft("story", p)} catalog={catalog} locale={locale} />;
      case "duo":
        return <DuoForm draft={drafts.duo} onChange={(p) => updateDraft("duo", p)} catalog={catalog} locale={locale} />;
      case "feature":
        return <FeatureForm draft={drafts.feature} onChange={(p) => updateDraft("feature", p)} catalog={catalog} locale={locale} />;
      case "film":
        return <FilmForm draft={drafts.film} onChange={(p) => updateDraft("film", p)} catalog={catalog} locale={locale} />;
      case "homeGrid":
        return <ProductRowForm section="homeGrid" draft={drafts.homeGrid} onChange={(p) => updateDraft("homeGrid", p)} catalog={catalog} locale={locale} />;
      case "services":
        return <ServicesForm draft={drafts.services} onChange={(p) => updateDraft("services", p)} />;
      case "instagram":
        return <InstagramForm draft={drafts.instagram} onChange={(p) => updateDraft("instagram", p)} />;
    }
  };

  const cards = (
    <div className="space-y-3">
      {ORDER.map((id, i) => (
        <SectionCard
          key={id}
          id={id}
          index={i + 1}
          title={t(`homePage.sections.${id}.title`)}
          hint={t(`homePage.sections.${id}.hint`)}
          summary={summary(id, drafts[id], catalog, locale)}
          dirty={dirty(id)}
          edited={edited(id)}
          open={open === id}
          errors={errors[id] ?? []}
          onToggle={() => setOpen((cur) => (cur === id ? null : id))}
          onSave={() => save(id)}
          onDiscard={() => discard(id)}
          onReset={() => resetSection(id)}
        >
          {renderForm(id)}
        </SectionCard>
      ))}

      <div className="pt-4">
        <button
          type="button"
          onClick={() => setConfirmResetAll(true)}
          data-testid="home-reset-all"
          className="caps text-[13px] text-muted underline underline-offset-4 transition-colors hover:text-danger"
        >
          {t("homePage.resetAll")}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-prose">
          <h1 className="caps font-serif text-title font-medium">{t("homePage.title")}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("homePage.intro")}</p>
        </div>
        <Link
          href="/"
          target="_blank"
          data-testid="home-view-store-top"
          className="caps inline-flex min-h-11 items-center text-[13px] underline-offset-4 transition-opacity hover:underline"
        >
          {t("homePage.viewStore")}
        </Link>
      </div>

      <div className="mt-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,6fr)] xl:gap-8">
        <div className="min-w-0">{cards}</div>

        {wide ? (
          <aside className="hidden min-w-0 xl:block">
            <HomePreview open={open ?? "ticker"} saveTick={saveTick} />
          </aside>
        ) : (
          <div className="mt-6 xl:hidden">
            <Link
              href="/"
              target="_blank"
              data-testid="home-view-store"
              className="caps inline-flex min-h-11 items-center border border-ink px-4 text-[13px] transition-colors hover:bg-ink hover:text-paper"
            >
              {t("homePage.viewStore")}
            </Link>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmResetAll}
        onOpenChange={setConfirmResetAll}
        title={t("homePage.resetAllTitle")}
        message={t("homePage.resetAllMessage")}
        confirmLabel={t("homePage.resetAllConfirm")}
        danger
        onConfirm={resetAll}
      />
    </div>
  );
}

function HomeEditorSkeleton() {
  return (
    <div aria-busy>
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-4 h-5 w-80 max-w-full" />
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
