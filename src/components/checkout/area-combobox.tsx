"use client";

import { Check, ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { areaById, areas, governorates, type Area } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { normalizeSearch } from "@/lib/search";
import { useUi } from "@/store/ui";

// "Al-Salem" / "al salem" / "Salem", "السالمية" / "سالمية": hyphens, apostrophes and the
// article are ignored when matching.
const norm = (s: string) => normalizeSearch(s).replace(/[-'’`]/g, " ").replace(/\s+/g, " ").trim();
const stripArticle = (s: string) => s.replace(/^(?:al |el |ال)/, "");

const INDEX = areas.map((area, order) => ({
  area,
  order,
  keys: [area.name.en, area.name.ar, ...(area.aliases ?? [])].map(norm),
}));

/** Areas matching an English or Arabic name or a common spelling, best first. */
export function matchAreas(query: string): Area[] {
  const q = norm(query);
  if (!q) return areas;
  const bare = stripArticle(q);
  return INDEX.map(({ area, order, keys }) => {
    let score = 0;
    for (const key of keys) {
      const k = stripArticle(key);
      if (key === q || k === bare) score = Math.max(score, 4);
      else if (key.startsWith(q) || k.startsWith(bare)) score = Math.max(score, 3);
      else if (key.split(" ").some((word) => stripArticle(word).startsWith(bare))) score = Math.max(score, 2);
      else if (key.includes(bare)) score = Math.max(score, 1);
    }
    return { area, order, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.area);
}

/** The single obvious area for what was typed (exact name/alias, or the only match). */
function bestGuess(query: string): Area | undefined {
  const q = norm(query);
  if (!q) return undefined;
  const results = matchAreas(q);
  const exact = results.find((a) => [a.name.en, a.name.ar, ...(a.aliases ?? [])].some((k) => norm(k) === q));
  return exact ?? (results.length === 1 ? results[0] : undefined);
}

const optionDomId = (listId: string, areaId: string) => `${listId}-${areaId}`;

type Props = {
  id: string;
  name: string;
  value: string;
  onChange: (areaId: string) => void;
  onBlur: () => void;
  invalid: boolean;
  describedBy?: string;
};

/**
 * WAI-ARIA combobox (list autocomplete): type to filter, ↑/↓ to move, Enter to choose,
 * Escape to close. Leaving the field picks the obvious match, so "salmiya" + Tab works.
 */
export const AreaCombobox = forwardRef<HTMLInputElement, Props>(function AreaCombobox(
  { id, name, value, onChange, onBlur, invalid, describedBy },
  ref,
) {
  const t = useTranslations("checkout.address");
  const locale = useLocale() as Locale;
  const announce = useUi((s) => s.announce);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, []);

  // null = not typing: the field shows the chosen area in the current language.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = value ? areaById(value) : undefined;
  const text = query ?? selected?.name[locale] ?? "";
  const results = useMemo(() => matchAreas(query ?? ""), [query]);
  const activeArea = open ? results[active] : undefined;
  const activeId = activeArea?.id;

  useEffect(() => {
    if (activeId) document.getElementById(optionDomId(listId, activeId))?.scrollIntoView({ block: "nearest" });
  }, [activeId, listId]);

  // Result counts are spoken once typing pauses.
  useEffect(() => {
    if (!open || query === null || !query.trim()) return;
    const timer = setTimeout(
      () => announce(results.length ? t("areaResults", { count: results.length }) : t("areaNoResults", { query })),
      700,
    );
    return () => clearTimeout(timer);
  }, [open, query, results.length, announce, t]);

  const openList = () => {
    setOpen(true);
    setActive(Math.max(0, results.findIndex((a) => a.id === value)));
  };

  const choose = (area: Area) => {
    onChange(area.id);
    setQuery(null);
    setOpen(false);
    announce(t("areaSelected", { name: area.name[locale] }));
  };

  const handleBlur = () => {
    setOpen(false);
    if (query !== null) {
      const typed = query.trim();
      const guess = bestGuess(typed);
      if (!typed) {
        onChange("");
        setQuery(null);
      } else if (guess) {
        onChange(guess.id);
        setQuery(null);
      } else if (!selected || norm(selected.name[locale]) !== norm(typed)) {
        // Keep what was typed so the error message makes sense.
        onChange("");
      } else {
        setQuery(null);
      }
    }
    onBlur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = results.length;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else if (count) setActive((i) => (i + 1) % count);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) setOpen(false);
        else if (!open) openList();
        else if (count) setActive((i) => (i - 1 + count) % count);
        break;
      case "Enter":
        // Never submit the whole checkout from the area search.
        e.preventDefault();
        if (open && activeArea) choose(activeArea);
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setQuery(null);
        }
        break;
    }
  };

  // On phones the keyboard covers the lower half: lift the field so the list stays visible.
  const handleFocus = () => {
    if (!window.matchMedia("(pointer: coarse) and (max-width: 767px)").matches) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    setTimeout(() => inputRef.current?.scrollIntoView({ block: "start", behavior }), 320);
  };

  return (
    <div className="relative scroll-mt-4">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId ? optionDomId(listId, activeId) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={text}
        placeholder={t("areaPlaceholder")}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onClick={() => !open && openList()}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className={cn(
          "h-12 w-full border bg-paper ps-3.5 pe-11 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-ink",
          invalid ? "border-danger" : "border-line",
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          inputRef.current?.focus();
          if (open) setOpen(false);
          else openList();
        }}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} strokeWidth={1.25} />
      </button>
      <ul
        id={listId}
        role="listbox"
        aria-label={t("areaList")}
        hidden={!open || results.length === 0}
        className="absolute inset-x-0 top-full z-30 max-h-64 overflow-y-auto overscroll-contain border border-t-0 border-ink bg-paper"
      >
        {results.map((area, i) => (
          <li
            key={area.id}
            id={optionDomId(listId, area.id)}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={() => i !== active && setActive(i)}
            onClick={() => choose(area)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-[15px] leading-snug",
              i === active && "bg-tile",
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Check
                className={cn("size-4 shrink-0", area.id === value ? "opacity-100" : "opacity-0")}
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="truncate">{area.name[locale]}</span>
            </span>
            <span className="shrink-0 text-[13px] text-muted">{governorates[area.governorate][locale]}</span>
          </li>
        ))}
      </ul>
      {open && results.length === 0 && query && (
        <p className="absolute inset-x-0 top-full z-30 border border-t-0 border-ink bg-paper px-3.5 py-3 text-[14px] text-muted">
          {t("areaNoResults", { query })}
        </p>
      )}
    </div>
  );
});
