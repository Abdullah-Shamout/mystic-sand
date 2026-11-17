import { z } from "zod";
import { phoneStatus } from "./phone";

// Errors are message KEYS (translated with t(`errors.${key}`) in the checkout
// namespace), so switching language re-translates visible errors.

const phoneField = (requiredKey: string) =>
  z.string().superRefine((value, ctx) => {
    const status = phoneStatus(value);
    if (status === "empty") ctx.addIssue({ code: "custom", message: requiredKey });
    else if (status === "landline") ctx.addIssue({ code: "custom", message: "phoneLandline" });
    else if (status === "invalid") ctx.addIssue({ code: "custom", message: "phoneInvalid" });
  });

/**
 * Rejects a NUL byte (\u0000): it passes zod's string checks but Postgres `text`/`jsonb` throws on
 * INSERT, so an un-guarded NUL in a stored free-text field is an insert-time error (and checkout,
 * unlike contact, has NO rate limiter). Rejecting ONLY \u0000 — not every control character — keeps
 * legitimate multi-line messages and addresses working. Shared by checkoutSchema (below) and the
 * contact submission schema (src/server/actions/contact.ts).
 */
export const noNul = (value: string): boolean => !value.includes("\u0000");

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, { error: "nameRequired" }).max(80, { error: "tooLong" }),
    phone: phoneField("phoneRequired"),
    email: z.union([z.literal(""), z.email({ error: "emailInvalid" })]),
    areaId: z.string().min(1, { error: "areaRequired" }),
    housing: z.enum(["house", "apartment", "office"]),
    block: z.string().trim().min(1, { error: "blockRequired" }).max(10, { error: "tooLong" }),
    street: z.string().trim().min(1, { error: "streetRequired" }).max(80, { error: "tooLong" }),
    avenue: z.string().trim().max(40, { error: "tooLong" }),
    building: z.string().trim().min(1, { error: "buildingRequired" }).max(40, { error: "tooLong" }),
    floor: z.string().trim().max(10, { error: "tooLong" }),
    apartment: z.string().trim().max(10, { error: "tooLong" }),
    mapsLink: z.string().trim().max(500, { error: "tooLong" }),
    notes: z.string().trim().max(300, { error: "tooLong" }),
    deliveryMethod: z.enum(["standard", "express"]),
    paymentMethod: z.enum(["knet", "applepay", "card"]),
    saveDetails: z.boolean(),
    acceptTerms: z.boolean().refine((v) => v, { error: "termsRequired" }),
  })
  .superRefine((v, ctx) => {
    if (v.housing !== "house") {
      if (!v.floor) ctx.addIssue({ code: "custom", path: ["floor"], message: "floorRequired" });
      if (!v.apartment) ctx.addIssue({ code: "custom", path: ["apartment"], message: "apartmentRequired" });
    }
    // Every string field here is persisted (name/address land in the order's `details` jsonb); a NUL
    // byte would throw on INSERT. Reject any field carrying one — an attacker-only input the real form
    // can't produce — reusing the existing "tooLong" message key so no translation is missing.
    for (const [key, value] of Object.entries(v)) {
      if (typeof value === "string" && !noNul(value)) {
        ctx.addIssue({ code: "custom", path: [key], message: "tooLong" });
      }
    }
  });

export type CheckoutForm = z.infer<typeof checkoutSchema>;

export const emptyCheckoutForm: CheckoutForm = {
  name: "",
  phone: "",
  email: "",
  areaId: "",
  housing: "house",
  block: "",
  street: "",
  avenue: "",
  building: "",
  floor: "",
  apartment: "",
  mapsLink: "",
  notes: "",
  deliveryMethod: "standard",
  paymentMethod: "knet",
  saveDetails: true,
  acceptTerms: false,
};

/** Fields remembered for returning shoppers ("Save my details"). */
export const rememberedFields = [
  "name",
  "phone",
  "email",
  "areaId",
  "housing",
  "block",
  "street",
  "avenue",
  "building",
  "floor",
  "apartment",
  "mapsLink",
  "notes",
] as const satisfies ReadonlyArray<keyof CheckoutForm>;
