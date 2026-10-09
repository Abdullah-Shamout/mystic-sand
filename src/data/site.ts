// Store-wide settings. Every value marked TODO(client) is a placeholder that the
// owner must confirm before launch (see the plan's "To confirm" list).

export const site = {
  brand: "Mystic Sand",
  instagram: { handle: "mystic.sand", url: "https://www.instagram.com/mystic.sand/" },
  // The WhatsApp and phone numbers now live in src/lib/settings.ts (defaultSettings),
  // so the admin can change them at runtime.
  email: "hello@mysticsand.com",
  // TODO(client): commercial registration details for the footer (Kuwait e-commerce rules).
  trade: {
    name: { en: "Mystic Sand General Trading", ar: "ميستك ساند للتجارة العامة" },
    cr: "CR No. 000000",
  },
  currency: "KWD",
  country: "KW",
} as const;

export const delivery = {
  // Fees now live in src/lib/settings.ts (defaultSettings). There is no free-delivery threshold.
  standard: { leadDays: 1 },
  express: {
    windowMinutes: 120,
    opens: "10:00",
    lastOrder: "20:00",
    fridayOpens: "14:00",
  },
  returnsDays: 14,
} as const;

export const payments = {
  knet: true,
  applePay: true,
  card: true,
  // Some banks ask for an SMS code from this amount (ABK: KD 25).
  otpFromFils: 25000,
  sessionSeconds: 7 * 60,
  otpSeconds: 4 * 60,
} as const;

export type PaymentMethod = "knet" | "applepay" | "card";

export const maxQtyPerLine = 10;

// TODO(client): real promotions. `?code=SAND10` applies a code automatically.
export const promoCodes: Record<string, { percent: number; expires: string }> = {
  SAND10: { percent: 10, expires: "2026-12-31" },
};
