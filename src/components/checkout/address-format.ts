"use client";

import { useLocale, useTranslations } from "next-intl";
import { areaById, governorates } from "@/data/kuwait-areas";
import type { Locale } from "@/i18n/routing";
import { iso } from "./form-helpers";
import type { OrderDetails } from "./order";

type Address = Pick<OrderDetails, "areaId" | "housing" | "block" | "street" | "avenue" | "building" | "floor" | "apartment">;

// "5" → "Street 5", but a name stays as typed ("Salem Al-Mubarak St").
const isNumber = (s: string) => /^\d[\d\s/-]*[a-z]?$/i.test(s.trim());

/** Kuwaiti address in the order people read it: Block, Street, Avenue · House/Building, Floor, Apt · Area. */
export function useAddressFormatter() {
  const t = useTranslations("checkout.format");
  const locale = useLocale() as Locale;
  return (d: Address) => {
    const sep = t("separator");
    const v = (s: string) => iso(s.trim());
    const flat = d.housing !== "house";
    const area = d.areaId ? areaById(d.areaId) : undefined;
    const street = [
      d.block.trim() && t("block", { value: v(d.block) }),
      d.street.trim() && (isNumber(d.street) ? t("street", { value: v(d.street) }) : v(d.street)),
      d.avenue.trim() && (isNumber(d.avenue) ? t("avenue", { value: v(d.avenue) }) : v(d.avenue)),
    ]
      .filter(Boolean)
      .join(sep);
    const building = [
      d.building.trim() && t(flat ? "building" : "house", { value: v(d.building) }),
      flat && d.floor.trim() && t("floor", { value: v(d.floor) }),
      flat && d.apartment.trim() && t(d.housing === "office" ? "office" : "apartment", { value: v(d.apartment) }),
    ]
      .filter(Boolean)
      .join(sep);
    return {
      area: area?.name[locale] ?? "",
      areaLine: area ? `${area.name[locale]}${sep}${governorates[area.governorate][locale]}` : "",
      street,
      building,
      country: t("country"),
    };
  };
}
