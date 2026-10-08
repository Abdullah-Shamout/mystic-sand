import { z } from "zod";
import { giftWrap } from "@/data/site";
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
    giftEnabled: z.boolean(),
    giftRecipient: z.string().trim().max(60, { error: "tooLong" }),
    giftPhone: z.string(),
    giftMessage: z.string().max(giftWrap.messageMax, { error: "tooLong" }),
    hidePrices: z.boolean(),
    paymentMethod: z.enum(["knet", "applepay", "card"]),
    saveDetails: z.boolean(),
    acceptTerms: z.boolean().refine((v) => v, { error: "termsRequired" }),
  })
  .superRefine((v, ctx) => {
    if (v.housing !== "house") {
      if (!v.floor) ctx.addIssue({ code: "custom", path: ["floor"], message: "floorRequired" });
      if (!v.apartment) ctx.addIssue({ code: "custom", path: ["apartment"], message: "apartmentRequired" });
    }
    if (v.giftEnabled && v.giftPhone && phoneStatus(v.giftPhone) !== "valid") {
      ctx.addIssue({ code: "custom", path: ["giftPhone"], message: "phoneInvalid" });
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
  giftEnabled: false,
  giftRecipient: "",
  giftPhone: "",
  giftMessage: "",
  hidePrices: true,
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
