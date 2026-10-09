import type { PaymentMethod } from "@/data/site";
import type { Locale } from "@/i18n/routing";
import { newTrackId } from "@/lib/order";
import { normalizeKuwaitPhone } from "@/lib/phone";
import { bagKey, computeTotals, priceLines, type BagLine, type Promo } from "@/lib/pricing";
import { checkoutSchema, rememberedFields, type CheckoutForm } from "@/lib/validation";
import { useCheckout, type Order, type OrderLine } from "@/store/checkout";

export type OrderDetails = Omit<CheckoutForm, "acceptTerms">;
export type OrderInput = Omit<Order, "createdAt" | "status" | "attempts" | "finalizedAt">;
export type BagSnapshot = { lines: BagLine[]; promo: Promo | null };

/** The terms box is never stored: it has to be ticked again on every order. */
export function withoutTerms(values: CheckoutForm): OrderDetails {
  const copy: Partial<CheckoutForm> = { ...values };
  delete copy.acceptTerms;
  return copy as OrderDetails;
}

const detailFields = new Set<string>(rememberedFields);

/** Contact + address pass validation (the rest of the form is ignored). */
export function detailsComplete(values: OrderDetails): boolean {
  const result = checkoutSchema.safeParse({ ...values, acceptTerms: true });
  return result.success || result.error.issues.every((issue) => !detailFields.has(String(issue.path[0])));
}

/** A returning shopper whose details are unchanged since the last order sees them collapsed. */
export function matchesRemembered(draft: CheckoutForm, remembered: Partial<CheckoutForm> | null): boolean {
  if (!remembered) return false;
  return rememberedFields.every((k) => (draft[k] ?? "") === (remembered[k] ?? "")) && detailsComplete(draft);
}

/** What is stored on the order: a normalised phone, and fields that don't apply cleared. */
function cleanDetails(d: OrderDetails): OrderDetails {
  const house = d.housing === "house";
  return {
    ...d,
    phone: normalizeKuwaitPhone(d.phone),
    floor: house ? "" : d.floor,
    apartment: house ? "" : d.apartment,
  };
}

/** Snapshot of the bag + details for useCheckout.createOrReuseOrder (call from event handlers only). */
export function buildOrderInput({
  details,
  bag,
  method,
  locale,
}: {
  details: OrderDetails;
  bag: BagSnapshot;
  method: PaymentMethod;
  locale: Locale;
}): OrderInput {
  const { priced } = priceLines(bag.lines);
  const lines: OrderLine[] = priced.map((l) => ({
    sku: l.sku,
    slug: l.product.slug,
    qty: l.qty,
    priceFils: l.variant.priceFils,
    name: l.product.name,
    size: l.variant.size,
    image: l.product.images.card,
  }));
  const { deliveryMethod } = details;
  return {
    id: newTrackId(useCheckout.getState().orders),
    locale,
    lines,
    totals: computeTotals({ lines: bag.lines, deliveryMethod, promo: bag.promo }),
    details: cleanDetails(details),
    promoCode: bag.promo?.code ?? null,
    bagKey: bagKey({ lines: bag.lines, deliveryMethod, promo: bag.promo }),
    method,
  };
}
