"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { expressWindow } from "@/components/content/values";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { resolveSettings } from "@/lib/settings";
import { useSettingsStore } from "@/store/settings";
import { useUi } from "@/store/ui";
import { SettingsCard } from "./settings-ui";

const MAX_MESSAGES = 4;
const MAX_CHARS = 90;

type Lists = { en: string[]; ar: string[] };

const cleanList = (list: string[]): string[] =>
  list.map((m) => m.trim()).filter((m) => m.length > 0 && m.length <= MAX_CHARS).slice(0, MAX_MESSAGES);

/** Top-banner ticker messages (1–4 per language). An empty list keeps the built-in messages. */
export function TickerSection() {
  const t = useTranslations("admin");
  const overrides = useSettingsStore((s) => s.overrides);
  const setOverrides = useSettingsStore((s) => s.setOverrides);
  const pushToast = useUi((s) => s.pushToast);
  const current = resolveSettings(overrides);

  const [lists, setLists] = useState<Lists>(() => ({
    en: [...current.ticker.en],
    ar: [...current.ticker.ar],
  }));

  const setList = (lang: keyof Lists, next: string[]) => setLists((l) => ({ ...l, [lang]: next }));

  const save = () => {
    const ticker = { en: cleanList(lists.en), ar: cleanList(lists.ar) };
    setOverrides({ ticker });
    setLists(ticker);
    pushToast({ title: t("settings.saved") });
  };

  const useBuiltIn = () => {
    const ticker = { en: [], ar: [] };
    setOverrides({ ticker });
    setLists(ticker);
    pushToast({ title: t("settings.saved") });
  };

  return (
    <SettingsCard title={t("settings.ticker.title")} intro={t("settings.ticker.intro")}>
      <div className="grid gap-6 lg:grid-cols-2">
        <MessageList lang="en" title={t("settings.ticker.en")} messages={lists.en} onChange={(n) => setList("en", n)} />
        <MessageList lang="ar" title={t("settings.ticker.ar")} messages={lists.ar} onChange={(n) => setList("ar", n)} />
      </div>

      <TickerPreview lists={lists} />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" size="sm" onClick={save} data-testid="ticker-save">
          {t("settings.save")}
        </Button>
        <button
          type="button"
          onClick={useBuiltIn}
          data-testid="ticker-built-in"
          className="caps text-[12px] text-muted underline underline-offset-4 transition-colors hover:text-ink"
        >
          {t("settings.ticker.useBuiltIn")}
        </button>
      </div>
    </SettingsCard>
  );
}

function MessageList({
  lang,
  title,
  messages,
  onChange,
}: {
  lang: keyof Lists;
  title: string;
  messages: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("admin");
  const isAr = lang === "ar";

  const update = (index: number, value: string) =>
    onChange(messages.map((m, i) => (i === index ? value : m)));
  const remove = (index: number) => onChange(messages.filter((_, i) => i !== index));
  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= messages.length) return;
    const next = [...messages];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  const add = () => {
    if (messages.length >= MAX_MESSAGES) return;
    onChange([...messages, ""]);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="caps text-[13px] font-medium">{title}</h3>
        <span className="figures text-[12px] text-muted">
          {t("settings.ticker.counter", { count: messages.length, max: MAX_MESSAGES })}
        </span>
      </div>

      {messages.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">{t("settings.ticker.builtInNote")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {messages.map((message, index) => {
            const over = message.length > MAX_CHARS;
            return (
              <li key={index} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TextInput
                    dir={isAr ? "rtl" : "ltr"}
                    lang={isAr ? "ar" : undefined}
                    value={message}
                    maxLength={120}
                    onChange={(e) => update(index, e.target.value)}
                    placeholder={t("settings.ticker.placeholder")}
                    className="h-11 text-[14px]"
                    data-testid={`ticker-${lang}-input-${index}`}
                  />
                  <p className={cn("figures mt-1 text-[11px]", over ? "text-danger" : "text-muted")}>
                    {message.trim().length}/{MAX_CHARS}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <IconButton
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    label={t("settings.ticker.moveUp")}
                    icon={ArrowUp}
                  />
                  <IconButton
                    onClick={() => move(index, 1)}
                    disabled={index === messages.length - 1}
                    label={t("settings.ticker.moveDown")}
                    icon={ArrowDown}
                  />
                  <IconButton onClick={() => remove(index)} label={t("settings.ticker.remove")} icon={Trash2} danger />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={add}
        disabled={messages.length >= MAX_MESSAGES}
        data-testid={`ticker-${lang}-add`}
        className="caps mt-2 inline-flex min-h-9 items-center gap-1.5 text-[12px] text-racing underline-offset-4 transition-colors hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline"
      >
        <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
        {t("settings.ticker.add")}
      </button>
    </div>
  );
}

function IconButton({
  onClick,
  disabled,
  label,
  icon: Icon,
  danger,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  icon: typeof ArrowUp;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "inline-flex size-9 items-center justify-center text-muted transition-colors disabled:opacity-30",
        danger ? "hover:text-danger" : "hover:text-ink",
      )}
    >
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

/** A non-rotating preview of the banner for the current admin language. */
function TickerPreview({ lists }: { lists: Lists }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;

  const builtIn = [tc("announcement.payment"), tc("announcement.express", { window: expressWindow(locale) })];
  const custom = cleanList(lists[locale]);
  const messages = custom.length > 0 ? custom : builtIn;

  return (
    <div>
      <p className="caps mb-1.5 text-[12px] text-muted">{t("settings.ticker.preview")}</p>
      <div className="overflow-hidden border border-line">
        {messages.map((message, index) => (
          <div
            key={index}
            dir={locale === "ar" ? "rtl" : "ltr"}
            className="flex h-10 items-center justify-center truncate border-b border-racing-deep/40 bg-racing px-6 text-center text-[13px] text-cream last:border-b-0 md:text-[14px]"
          >
            <span className="truncate">{message}</span>
          </div>
        ))}
      </div>
      {custom.length === 0 && (
        <p className="mt-1.5 text-[12px] text-muted">{t("settings.ticker.builtInNote")}</p>
      )}
    </div>
  );
}
