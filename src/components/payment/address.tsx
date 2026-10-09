import { Fragment } from "react";
import type { Order } from "@/store/checkout";

export type AddressLabels = Record<
  "block" | "street" | "avenue" | "house" | "building" | "floor" | "apartment" | "office",
  string
>;

type Part = { label: string | null; value: string };

// Kuwaiti addresses are mostly numbers ("Street 5", "Building 12A") but sometimes names
// ("Salem Al-Mubarak St", "Tower B"): the label is only added when the value has no word in it.
const part = (label: string, value: string): Part => ({
  label: /\p{L}{2,}/u.test(value) ? null : label,
  value: value.trim(),
});

/** Kuwait address order: Block, Street, Avenue · House, or Building, Floor, Apartment/Office. */
export function addressParts(details: Order["details"], labels: AddressLabels): [Part[], Part[]] {
  const street = [
    part(labels.block, details.block),
    part(labels.street, details.street),
    part(labels.avenue, details.avenue),
  ];
  const unit =
    details.housing === "house"
      ? [part(labels.house, details.building)]
      : [
          part(labels.building, details.building),
          part(labels.floor, details.floor),
          part(details.housing === "office" ? labels.office : labels.apartment, details.apartment),
        ];
  const filled = (parts: Part[]) => parts.filter((p) => p.value);
  return [filled(street), filled(unit)];
}

/** Renders parts with each typed value isolated, so Latin street names sit cleanly in Arabic. */
export function AddressParts({ parts, separator }: { parts: Part[]; separator: string }) {
  return parts.map((p, i) => (
    <Fragment key={`${p.label}-${i}`}>
      {i > 0 && separator}
      {p.label && `${p.label} `}
      <bdi>{p.value}</bdi>
    </Fragment>
  ));
}
