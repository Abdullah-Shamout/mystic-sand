import type { Localized } from "./types";

// KNET member banks shown in the payment simulation.
// Ahli United Bank is omitted: it merged into KFH.
export const banks: Array<{ id: string; name: Localized }> = [
  { id: "nbk", name: { en: "National Bank of Kuwait (NBK)", ar: "بنك الكويت الوطني" } },
  { id: "kfh", name: { en: "Kuwait Finance House (KFH)", ar: "بيت التمويل الكويتي" } },
  { id: "gulf", name: { en: "Gulf Bank", ar: "بنك الخليج" } },
  { id: "cbk", name: { en: "Commercial Bank of Kuwait (CBK)", ar: "البنك التجاري الكويتي" } },
  { id: "abk", name: { en: "Al Ahli Bank of Kuwait (ABK)", ar: "البنك الأهلي الكويتي" } },
  { id: "burgan", name: { en: "Burgan Bank", ar: "بنك برقان" } },
  { id: "boubyan", name: { en: "Boubyan Bank", ar: "بنك بوبيان" } },
  { id: "kib", name: { en: "Kuwait International Bank (KIB)", ar: "بنك الكويت الدولي" } },
  { id: "warba", name: { en: "Warba Bank", ar: "بنك وربة" } },
];
