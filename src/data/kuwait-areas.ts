import type { Localized } from "./types";

export type Governorate = "capital" | "hawalli" | "farwaniya" | "mubarak-al-kabeer" | "ahmadi" | "jahra";

export const governorates: Record<Governorate, Localized> = {
  capital: { en: "Capital (Al Asimah)", ar: "محافظة العاصمة" },
  hawalli: { en: "Hawalli", ar: "محافظة حولي" },
  farwaniya: { en: "Farwaniya", ar: "محافظة الفروانية" },
  "mubarak-al-kabeer": { en: "Mubarak Al-Kabeer", ar: "محافظة مبارك الكبير" },
  ahmadi: { en: "Ahmadi", ar: "محافظة الأحمدي" },
  jahra: { en: "Jahra", ar: "محافظة الجهراء" },
};

export type Area = {
  id: string;
  governorate: Governorate;
  name: Localized;
  /** Other spellings people type. */
  aliases?: string[];
};

const a = (governorate: Governorate, id: string, en: string, ar: string, aliases: string[] = []): Area => ({
  id,
  governorate,
  name: { en, ar },
  aliases,
});

// Main residential areas per governorate. TODO(client): confirm delivery zones.
export const areas: Area[] = [
  // Capital
  a("capital", "kuwait-city", "Kuwait City", "مدينة الكويت", ["city", "madinat al kuwait", "العاصمة"]),
  a("capital", "sharq", "Sharq", "شرق"),
  a("capital", "mirqab", "Mirqab", "المرقاب"),
  a("capital", "qibla", "Qibla", "القبلة", ["jibla"]),
  a("capital", "dasman", "Dasman", "دسمان"),
  a("capital", "dasma", "Dasma", "الدسمة"),
  a("capital", "bneid-al-gar", "Bneid Al-Gar", "بنيد القار", ["bnaid al qar", "bneid al qar"]),
  a("capital", "daiya", "Daiya", "الدعية", ["daiyah", "da'iya"]),
  a("capital", "abdullah-al-salem", "Abdullah Al-Salem", "ضاحية عبدالله السالم", ["abdulla al salem"]),
  a("capital", "mansouriya", "Mansouriya", "المنصورية", ["mansuriya"]),
  a("capital", "faiha", "Faiha", "الفيحاء", ["fayha"]),
  a("capital", "nuzha", "Nuzha", "النزهة", ["nuzhah"]),
  a("capital", "qadsiya", "Qadsiya", "القادسية", ["qadisiya", "qadisiyah"]),
  a("capital", "rawda", "Rawda", "الروضة", ["rawdha", "rawdah"]),
  a("capital", "adailiya", "Adailiya", "العديلية", ["adailiyah", "udailiya"]),
  a("capital", "khaldiya", "Khaldiya", "الخالدية", ["khaldiyah"]),
  a("capital", "kaifan", "Kaifan", "كيفان", ["kaifaan"]),
  a("capital", "shamiya", "Shamiya", "الشامية", ["shamiyah"]),
  a("capital", "yarmouk", "Yarmouk", "اليرموك", ["yarmuk"]),
  a("capital", "qortuba", "Qortuba", "قرطبة", ["qurtuba", "cordoba"]),
  a("capital", "surra", "Surra", "السرة", ["surrah"]),
  a("capital", "granada", "Granada", "غرناطة", ["gharnata"]),
  a("capital", "shuwaikh", "Shuwaikh (Residential)", "الشويخ السكنية", ["shuwaikh"]),
  a("capital", "sulaibikhat", "Sulaibikhat", "الصليبخات"),
  a("capital", "doha", "Doha", "الدوحة"),
  a("capital", "nahda", "Nahda", "النهضة", ["nahdha"]),
  a("capital", "jaber-al-ahmad", "Jaber Al-Ahmad City", "مدينة جابر الأحمد", ["jaber al ahmed"]),
  a("capital", "qairawan", "Qairawan", "القيروان"),

  // Hawalli
  a("hawalli", "hawalli", "Hawalli", "حولي", ["hawally"]),
  a("hawalli", "salmiya", "Salmiya", "السالمية", ["salmiyah", "salmia", "salmiyya"]),
  a("hawalli", "rumaithiya", "Rumaithiya", "الرميثية", ["rumaithiyah", "rumaythiya"]),
  a("hawalli", "jabriya", "Jabriya", "الجابرية", ["jabriyah", "jabria"]),
  a("hawalli", "mishref", "Mishref", "مشرف", ["mushrif"]),
  a("hawalli", "bayan", "Bayan", "بيان"),
  a("hawalli", "salwa", "Salwa", "سلوى"),
  a("hawalli", "shaab", "Shaab", "الشعب", ["sha'ab"]),
  a("hawalli", "shuhada", "Shuhada", "الشهداء"),
  a("hawalli", "hitteen", "Hitteen", "حطين", ["hittin"]),
  a("hawalli", "salam", "Salam", "السلام"),
  a("hawalli", "zahra", "Zahra", "الزهراء", ["zahraa"]),
  a("hawalli", "siddiq", "Siddiq", "الصديق", ["sideeq"]),
  a("hawalli", "mubarak-al-abdullah", "Mubarak Al-Abdullah (West Mishref)", "مبارك العبدالله (غرب مشرف)", ["west mishref"]),
  a("hawalli", "maidan-hawalli", "Maidan Hawalli", "ميدان حولي"),
  a("hawalli", "bidaa", "Al-Bidaa", "البدع", ["bida", "bidea"]),

  // Farwaniya
  a("farwaniya", "farwaniya", "Farwaniya", "الفروانية", ["farwaniyah"]),
  a("farwaniya", "khaitan", "Khaitan", "خيطان"),
  a("farwaniya", "jleeb", "Jleeb Al-Shuyoukh", "جليب الشيوخ", ["jleeb", "jleeb al shuyoukh", "abbasiya"]),
  a("farwaniya", "abraq-khaitan", "Abraq Khaitan", "أبرق خيطان"),
  a("farwaniya", "ardiya", "Ardiya", "العارضية", ["ardhiya", "ardiyah"]),
  a("farwaniya", "andalous", "Andalous", "الأندلس", ["andalus"]),
  a("farwaniya", "rabiya", "Rabiya", "الرابية", ["rabia"]),
  a("farwaniya", "rehab", "Rehab", "الرحاب"),
  a("farwaniya", "omariya", "Omariya", "العمرية", ["omariyah"]),
  a("farwaniya", "ishbiliya", "Ishbiliya", "إشبيلية", ["seville"]),
  a("farwaniya", "firdous", "Firdous", "الفردوس", ["ferdous"]),
  a("farwaniya", "riggae", "Riggae", "الرقعي", ["riqqai", "reggai"]),
  a("farwaniya", "sabah-al-nasser", "Sabah Al-Nasser", "صباح الناصر", ["sabah al naser"]),
  a("farwaniya", "abdullah-al-mubarak", "Abdullah Al-Mubarak", "عبدالله المبارك", ["west jleeb"]),
  a("farwaniya", "dhajeej", "Dhajeej", "الضجيج", ["dajeej"]),

  // Mubarak Al-Kabeer
  a("mubarak-al-kabeer", "mubarak-al-kabeer", "Mubarak Al-Kabeer", "مبارك الكبير"),
  a("mubarak-al-kabeer", "qurain", "Qurain", "القرين", ["qrain"]),
  a("mubarak-al-kabeer", "qusour", "Qusour", "القصور", ["qusur"]),
  a("mubarak-al-kabeer", "adan", "Adan", "العدان"),
  a("mubarak-al-kabeer", "sabah-al-salem", "Sabah Al-Salem", "صباح السالم", ["sabah al salim"]),
  a("mubarak-al-kabeer", "messila", "Messila", "المسيلة", ["masila"]),
  a("mubarak-al-kabeer", "abu-fatira", "Abu Fatira", "أبو فطيرة", ["abu fteira"]),
  a("mubarak-al-kabeer", "fnaitees", "Fnaitees", "الفنيطيس", ["fnaites"]),
  a("mubarak-al-kabeer", "abu-al-hasaniya", "Abu Al-Hasaniya", "أبو الحصانية", ["abu hasaniya"]),
  a("mubarak-al-kabeer", "wista", "Wista", "الوسطى"),

  // Ahmadi
  a("ahmadi", "ahmadi", "Ahmadi", "الأحمدي", ["ahmady"]),
  a("ahmadi", "fahaheel", "Fahaheel", "الفحيحيل", ["fahahil"]),
  a("ahmadi", "mangaf", "Mangaf", "المنقف", ["manqaf"]),
  a("ahmadi", "abu-halifa", "Abu Halifa", "أبو حليفة", ["abu halifah"]),
  a("ahmadi", "fintas", "Fintas", "الفنطاس", ["fintass"]),
  a("ahmadi", "mahboula", "Mahboula", "المهبولة", ["mahbula"]),
  a("ahmadi", "egaila", "Egaila", "العقيلة", ["eqaila", "aqaila", "al egaila"]),
  a("ahmadi", "riqqa", "Riqqa", "الرقة", ["reqqa"]),
  a("ahmadi", "hadiya", "Hadiya", "هدية", ["hadiyah"]),
  a("ahmadi", "sabahiya", "Sabahiya", "الصباحية", ["subahiya"]),
  a("ahmadi", "fahad-al-ahmad", "Fahad Al-Ahmad", "فهد الأحمد"),
  a("ahmadi", "jaber-al-ali", "Jaber Al-Ali", "جابر العلي"),
  a("ahmadi", "dhaher", "Dhaher", "الظهر", ["daher"]),
  a("ahmadi", "sabah-al-ahmad", "Sabah Al-Ahmad City", "مدينة صباح الأحمد"),
  a("ahmadi", "khairan", "Khairan", "الخيران"),
  a("ahmadi", "wafra", "Wafra", "الوفرة"),
  a("ahmadi", "zour", "Zour", "الزور", ["zor"]),

  // Jahra
  a("jahra", "jahra", "Jahra", "الجهراء", ["jahrah"]),
  a("jahra", "saad-al-abdullah", "Saad Al-Abdullah", "سعد العبدالله"),
  a("jahra", "oyoun", "Oyoun", "العيون", ["oyoon"]),
  a("jahra", "naeem", "Naeem", "النعيم", ["naem"]),
  a("jahra", "qasr", "Qasr", "القصر"),
  a("jahra", "waha", "Waha", "الواحة"),
  a("jahra", "taima", "Taima", "تيماء", ["tayma"]),
  a("jahra", "naseem", "Naseem", "النسيم"),
  a("jahra", "amghara", "Amghara", "أمغرة"),
  a("jahra", "sulaibiya", "Sulaibiya", "الصليبية", ["sulaibiyah"]),
  a("jahra", "mutlaa", "Mutlaa City", "مدينة المطلاع", ["mutla"]),
];

export const areaById = (id: string) => areas.find((x) => x.id === id);
