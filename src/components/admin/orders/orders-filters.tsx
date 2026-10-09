"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { SelectInput, TextInput } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import {
  defaultFilters,
  type DeliveryFilter,
  type Filters,
  type FulfillmentFilter,
  type MethodFilter,
  type RangeFilter,
  type SourceFilter,
} from "@/lib/admin/orders";

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="caps mb-1.5 text-[12px] text-muted">{label}</p>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "caps inline-flex min-h-9 items-center border px-3 text-[12px] transition-colors",
              value === o.value
                ? "border-racing bg-racing text-cream"
                : "border-line bg-paper text-ink hover:border-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  values,
  render,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  values: readonly T[];
  render: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="caps mb-1.5 block text-[12px] text-muted">
        {label}
      </label>
      <SelectInput id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {values.map((v) => (
          <option key={v} value={v}>
            {render(v)}
          </option>
        ))}
      </SelectInput>
    </div>
  );
}

const RANGES: readonly RangeFilter[] = ["today", "7d", "30d", "month", "all", "custom"];
const METHODS: readonly MethodFilter[] = ["all", "knet", "applepay", "card"];
const DELIVERIES: readonly DeliveryFilter[] = ["all", "standard", "express"];

export function OrdersFilters({ value, onChange }: { value: Filters; onChange: (filters: Filters) => void }) {
  const t = useTranslations("admin");
  const uid = useId();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });

  const fulfillmentOpts = (["all", "pending", "done", "unpaid"] as FulfillmentFilter[]).map((v) => ({
    value: v,
    label: t(`filters.fulfillment.${v}`),
  }));
  const sourceOpts = (["all", "site", "sample"] as SourceFilter[]).map((v) => ({
    value: v,
    label: t(`filters.source.${v}`),
  }));

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${uid}-search`} className="caps mb-1.5 block text-[12px] text-muted">
          {t("filters.searchLabel")}
        </label>
        <TextInput
          id={`${uid}-search`}
          type="search"
          value={value.query}
          placeholder={t("filters.searchPlaceholder")}
          onChange={(e) => set({ query: e.target.value })}
          data-testid="orders-search"
        />
      </div>

      <Chips
        label={t("filters.fulfillmentLabel")}
        value={value.fulfillment}
        options={fulfillmentOpts}
        onChange={(v) => set({ fulfillment: v })}
      />

      <SelectField
        id={`${uid}-range`}
        label={t("filters.rangeLabel")}
        value={value.range}
        values={RANGES}
        render={(v) => t(`filters.range.${v}`)}
        onChange={(v) => set({ range: v })}
      />
      <SelectField
        id={`${uid}-method`}
        label={t("filters.methodLabel")}
        value={value.method}
        values={METHODS}
        render={(v) => t(`filters.method.${v}`)}
        onChange={(v) => set({ method: v })}
      />

      {value.range === "custom" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-from`} className="caps mb-1.5 block text-[12px] text-muted">
              {t("filters.from")}
            </label>
            <TextInput
              id={`${uid}-from`}
              type="date"
              value={value.from ?? ""}
              onChange={(e) => set({ from: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`${uid}-to`} className="caps mb-1.5 block text-[12px] text-muted">
              {t("filters.to")}
            </label>
            <TextInput
              id={`${uid}-to`}
              type="date"
              value={value.to ?? ""}
              onChange={(e) => set({ to: e.target.value })}
            />
          </div>
        </div>
      )}

      <SelectField
        id={`${uid}-delivery`}
        label={t("filters.deliveryLabel")}
        value={value.delivery}
        values={DELIVERIES}
        render={(v) => t(`filters.delivery.${v}`)}
        onChange={(v) => set({ delivery: v })}
      />
      <Chips
        label={t("filters.sourceLabel")}
        value={value.source}
        options={sourceOpts}
        onChange={(v) => set({ source: v })}
      />

      <button
        type="button"
        onClick={() => onChange({ ...defaultFilters })}
        className="caps text-[12px] text-muted underline underline-offset-4 hover:text-ink"
      >
        {t("filters.reset")}
      </button>
    </div>
  );
}
