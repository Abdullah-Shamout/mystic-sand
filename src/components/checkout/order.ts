import { checkoutSchema, rememberedFields, type CheckoutForm } from "@/lib/validation";

export type OrderDetails = Omit<CheckoutForm, "acceptTerms">;

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
