import type { Localized, Notes, Product } from "./types";

// Catalog for the prototype. Names, sizes and types are as printed on the
// packaging. Notes for AURA and OUD (and partly CAFÉ and Oasis) come from the
// brand's Instagram; everything marked in `todo` is a placeholder for the owner.

const n = (en: string, ar: string): Localized => ({ en, ar });

const EDP = n("Eau de Parfum", "ماء عطر");
const ROOM = n("Room & Linen Spray", "معطّر للغرف والمفارش");

const howToEdp = n(
  "Spray on pulse points — wrists, neck and behind the ears — from about 15 cm.",
  "رشّه على نقاط النبض — المعصمين والرقبة وخلف الأذنين — من مسافة 15 سم تقريباً.",
);
const howToRoom = n(
  "Mist two or three times into the air, onto curtains, cushions or linen.",
  "رشّ مرتين أو ثلاثاً في الهواء أو على الستائر والوسائد والمفارش.",
);

const notes = (top: Localized[], heart: Localized[], base: Localized[]): Notes => ({ top, heart, base });

export const products: Product[] = [
  {
    slug: "i",
    name: "I",
    category: "perfumes",
    collection: "trilogy",
    type: EDP,
    family: n("Woody · Aromatic", "خشبي · عطري"),
    tagline: n("A clean, luminous woody signature.", "توقيع خشبي نقي ومشرق."),
    description: n(
      "The opening chapter of the Trilogy. Bright bergamot and cardamom drift over lavender and cool cedarwood — an easy, everyday elegance that stays close to the skin.",
      "الفصل الأول من الثلاثية. برغموت مشرق وهيل يتهاديان فوق اللافندر وخشب الأرز البارد — أناقة يومية هادئة تبقى قريبة من البشرة.",
    ),
    notes: notes(
      [n("Bergamot", "برغموت"), n("Neroli", "نيرولي")],
      [n("Cardamom", "هيل"), n("Lavender", "لافندر")],
      [n("Cedarwood", "خشب الأرز"), n("White musk", "مسك أبيض")],
    ),
    howTo: howToEdp,
    variants: [{ sku: "MS-I-50", size: n("50 ml", "50 مل"), priceFils: 19000, stock: 24 }],
    images: {
      card: "products/i/bottle",
      hover: "products/i/box",
      gallery: ["products/i/bottle", "products/i/with-box", "lifestyle/candles-duo", "products/i/box-angle", "renders/i"],
    },
    related: ["ii", "iii", "aura", "oud"],
    aliases: ["one", "1", "واحد", "الأول", "trilogy", "الثلاثية"],
    todo: ["price", "notes", "copy"],
  },
  {
    slug: "ii",
    name: "II",
    category: "perfumes",
    collection: "trilogy",
    type: EDP,
    family: n("Amber · Oud", "عنبري · عود"),
    tagline: n("Warm saffron and smoky oud.", "زعفران دافئ وعود مدخّن."),
    description: n(
      "The heart of the Trilogy. Saffron and nutmeg glow over a core of oud and soft leather, settling into amber and sandalwood as the evening falls.",
      "قلب الثلاثية. زعفران وجوزة الطيب يتوهّجان فوق قلب من العود والجلد الناعم، ليستقرّا على العنبر وخشب الصندل مع حلول المساء.",
    ),
    notes: notes(
      [n("Saffron", "زعفران"), n("Nutmeg", "جوزة الطيب")],
      [n("Oud", "عود"), n("Leather", "جلد")],
      [n("Amber", "عنبر"), n("Sandalwood", "خشب الصندل")],
    ),
    howTo: howToEdp,
    variants: [{ sku: "MS-II-50", size: n("50 ml", "50 مل"), priceFils: 19000, stock: 24 }],
    images: {
      card: "products/ii/bottle",
      hover: "products/ii/box",
      gallery: ["products/ii/bottle", "products/ii/with-box", "lifestyle/candles-duo", "products/ii/box-angle", "renders/ii"],
    },
    related: ["i", "iii", "oud", "cafe"],
    aliases: ["two", "2", "اثنان", "الثاني", "trilogy", "الثلاثية"],
    todo: ["price", "notes", "copy"],
  },
  {
    slug: "iii",
    name: "III",
    category: "perfumes",
    collection: "trilogy",
    type: EDP,
    family: n("Floral · Musky", "زهري · مسكي"),
    tagline: n("Taif rose in the golden hour.", "ورد طائفي في الساعة الذهبية."),
    description: n(
      "The final chapter. Pink pepper and bergamot open onto a bouquet of Taif rose and peony, resting on musk and patchouli — romantic, radiant and long-lasting.",
      "الفصل الأخير. فلفل وردي وبرغموت ينفتحان على باقة من الورد الطائفي والفاوانيا، تستقرّ على المسك والباتشولي — عطر رومانسي متألّق يدوم طويلاً.",
    ),
    notes: notes(
      [n("Pink pepper", "فلفل وردي"), n("Bergamot", "برغموت")],
      [n("Taif rose", "ورد طائفي"), n("Peony", "فاوانيا")],
      [n("Musk", "مسك"), n("Patchouli", "باتشولي")],
    ),
    howTo: howToEdp,
    variants: [{ sku: "MS-III-50", size: n("50 ml", "50 مل"), priceFils: 19000, stock: 24 }],
    images: {
      card: "products/iii/bottle",
      hover: "products/iii/box",
      gallery: ["products/iii/bottle", "products/iii/with-box", "lifestyle/roses-iii", "products/iii/box-angle", "renders/iii"],
    },
    related: ["i", "ii", "aura", "oasis"],
    aliases: ["three", "3", "ثلاثة", "الثالث", "rose", "ورد", "trilogy", "الثلاثية"],
    todo: ["price", "notes", "copy"],
  },
  {
    slug: "cafe",
    name: "CAFÉ",
    category: "perfumes",
    type: EDP,
    family: n("Gourmand · Woody", "غورماند · خشبي"),
    tagline: n("Freshly brewed arabica, softened with vanilla.", "قهوة أرابيكا طازجة تلطّفها الفانيليا."),
    description: n(
      "An ode to the first cup of the day. Creamy lemon lifts into freshly brewed arabica before settling on Indonesian patchouli and vanilla.",
      "تحية لفنجان القهوة الأول في الصباح. ليمون كريمي يرتقي إلى قهوة أرابيكا طازجة قبل أن يستقرّ على الباتشولي الإندونيسي والفانيليا.",
    ),
    notes: notes(
      [n("Creamy lemon", "ليمون كريمي")],
      [n("Arabica coffee", "قهوة أرابيكا")],
      [n("Indonesian patchouli", "باتشولي إندونيسي"), n("Vanilla", "فانيليا")],
    ),
    howTo: howToEdp,
    variants: [{ sku: "MS-CAFE-30", size: n("30 ml", "30 مل"), priceFils: 12000, stock: 30 }],
    images: {
      card: "products/cafe/bottle",
      hover: "renders/cafe",
      gallery: ["products/cafe/bottle", "renders/cafe"],
    },
    related: ["oud", "ii", "aura", "dune"],
    aliases: ["cafe", "coffee", "قهوة", "كافيه", "كافي"],
    todo: ["price", "copy"],
  },
  {
    slug: "oud",
    name: "OUD",
    category: "perfumes",
    alsoIn: ["oud"],
    type: EDP,
    family: n("Woody · Floral", "خشبي · زهري"),
    tagline: n("Cambodian and Indian oud, touched with florals.", "عود كمبودي وهندي بلمسة زهرية."),
    description: n(
      "A mix of Cambodian and Indian oud with a touch of floral notes that bloom with each spray — deep, resinous and unmistakably of the Gulf.",
      "مزيج من العود الكمبودي والعود الهندي مع لمسة من النفحات الزهرية التي تتفتّح مع كل رشة — عميق وراتنجي بروح خليجية أصيلة.",
    ),
    notes: notes(
      [n("Floral notes", "نفحات زهرية")],
      [n("Indian oud", "عود هندي")],
      [n("Cambodian oud", "عود كمبودي")],
    ),
    howTo: howToEdp,
    variants: [{ sku: "MS-OUD-30", size: n("30 ml", "30 مل"), priceFils: 12000, stock: 30 }],
    images: {
      card: "products/oud/bottle",
      hover: "renders/oud",
      gallery: ["products/oud/bottle", "renders/oud", "products/oud-chips/chips"],
    },
    related: ["cafe", "oud-chips", "ii", "dune"],
    aliases: ["oud", "عود", "agarwood"],
    todo: ["price"],
  },
  {
    slug: "aura",
    name: "AURA",
    category: "body",
    type: n("All Over Spray", "بخاخ معطّر للجسم"),
    family: n("Fruity · Musky", "فاكهي · مسكي"),
    tagline: n("Every spray captures the moment.", "كل رشة، تأسر لحظة."),
    description: n(
      "A soft veil for skin, hair and clothes. Raspberry and a touch of ambergris open onto cardamom and violet petals, resting on white musk and black cedarwood.",
      "وشاح ناعم للبشرة والشعر والملابس. توت العليق ولمسة من العنبر ينفتحان على الهيل وبتلات البنفسج، ليستقرّا على المسك الأبيض وخشب الأرز الأسود.",
    ),
    notes: notes(
      [n("Raspberry", "توت العليق"), n("Ambergris", "عنبر")],
      [n("Cardamom", "هيل"), n("Violet petals", "بتلات البنفسج")],
      [n("White musk", "مسك أبيض"), n("Black cedarwood", "خشب الأرز الأسود")],
    ),
    howTo: n(
      "Spray generously over skin, hair and clothes after showering.",
      "رشّه بسخاء على البشرة والشعر والملابس بعد الاستحمام.",
    ),
    variants: [{ sku: "MS-AURA-100", size: n("100 ml", "100 مل"), priceFils: 6500, stock: 40 }],
    images: {
      card: "products/aura/can",
      hover: "renders/aura",
      gallery: ["products/aura/can", "renders/aura"],
    },
    badge: "new",
    related: ["iii", "cafe", "oasis", "i"],
    aliases: ["aura", "body", "mist", "أورا", "اورا", "بخاخ", "جسم"],
    todo: ["price"],
  },
  {
    slug: "oasis",
    name: "Oasis",
    category: "home",
    type: ROOM,
    family: n("Floral", "زهري"),
    tagline: n("Yuzu and rose for sunlit rooms.", "يوزو وورد لغرف مشمسة."),
    description: n(
      "A floral mist for your home and linen. Bright yuzu and rose over vanilla, white musk and soft woods — like stepping into a garden in the desert.",
      "رذاذ زهري لمنزلك ومفارشك. يوزو مشرق وورد فوق الفانيليا والمسك الأبيض والأخشاب الناعمة — كأنك تدخل حديقة في قلب الصحراء.",
    ),
    notes: notes(
      [n("Yuzu", "يوزو")],
      [n("Rose", "ورد")],
      [n("Vanilla", "فانيليا"), n("White musk", "مسك أبيض"), n("Woods", "أخشاب")],
    ),
    howTo: howToRoom,
    variants: [{ sku: "MS-OASIS-250", size: n("250 ml", "250 مل"), priceFils: 7500, stock: 30 }],
    images: {
      card: "products/oasis/bottle",
      hover: "renders/oasis",
      gallery: ["products/oasis/bottle", "renders/oasis", "products/home-trio"],
    },
    related: ["mist", "dune", "oud-chips", "aura"],
    aliases: ["oasis", "room", "home", "واحة", "معطر", "منزل"],
    todo: ["price", "size"],
  },
  {
    slug: "mist",
    name: "Mist",
    category: "home",
    type: ROOM,
    family: n("Fresh · Aquatic", "منعش · مائي"),
    tagline: n("A cool breeze of sea salt and green tea.", "نسمة باردة من ملح البحر والشاي الأخضر."),
    description: n(
      "Fresh and airy, for bedrooms and linen. Sea salt and bergamot over lily and green tea, drying down to driftwood and clean musk.",
      "منعش وخفيف لغرف النوم والمفارش. ملح البحر والبرغموت فوق الزنبق والشاي الأخضر، ليستقرّ على خشب الشاطئ والمسك النقي.",
    ),
    notes: notes(
      [n("Sea salt", "ملح البحر"), n("Bergamot", "برغموت")],
      [n("Lily", "زنبق"), n("Green tea", "شاي أخضر")],
      [n("Driftwood", "خشب الشاطئ"), n("Musk", "مسك")],
    ),
    howTo: howToRoom,
    variants: [{ sku: "MS-MIST-250", size: n("250 ml", "250 مل"), priceFils: 7500, stock: 30 }],
    images: {
      card: "products/mist/bottle",
      hover: "renders/mist",
      gallery: ["products/mist/bottle", "renders/mist", "products/home-trio-alt"],
    },
    related: ["oasis", "dune", "oud-chips", "i"],
    aliases: ["mist", "room", "home", "ضباب", "معطر", "منزل"],
    todo: ["price", "size", "notes"],
  },
  {
    slug: "dune",
    name: "Dune",
    category: "home",
    type: ROOM,
    family: n("Amber · Spicy", "عنبري · حار"),
    tagline: n("Warm amber and frankincense at dusk.", "عنبر دافئ ولبان عند الغروب."),
    description: n(
      "Our warmest home scent. Saffron, amber and frankincense over oud and sandalwood — the glow of the desert at sunset, for the majlis and living room.",
      "أدفأ عطورنا للمنزل. زعفران وعنبر ولبان فوق العود وخشب الصندل — وهج الصحراء عند الغروب، للمجلس وغرفة المعيشة.",
    ),
    notes: notes(
      [n("Saffron", "زعفران")],
      [n("Amber", "عنبر"), n("Frankincense", "لبان")],
      [n("Oud", "عود"), n("Sandalwood", "خشب الصندل")],
    ),
    howTo: howToRoom,
    variants: [{ sku: "MS-DUNE-250", size: n("250 ml", "250 مل"), priceFils: 7500, stock: 30 }],
    images: {
      card: "products/dune/bottle",
      hover: "renders/dune",
      gallery: ["products/dune/bottle", "renders/dune", "products/home-trio"],
    },
    related: ["oasis", "mist", "oud-chips", "oud"],
    aliases: ["dune", "room", "home", "كثبان", "معطر", "منزل", "مجلس"],
    todo: ["price", "size", "notes"],
  },
  {
    slug: "oud-chips",
    name: "Natural Oud Chips",
    category: "oud",
    type: n("Natural Agarwood · Bakhoor", "عود طبيعي · بخور"),
    tagline: n("Hand-selected agarwood for the mabkhara.", "عود طبيعي منتقى يدوياً للمبخرة."),
    description: n(
      "Natural agarwood chips, hand-selected for a slow, rich smoke. Warm one or two pieces on a charcoal or electric mabkhara to perfume your home, clothes and guests.",
      "قطع عود طبيعي منتقاة يدوياً لدخان غني يدوم طويلاً. ضع قطعة أو قطعتين على مبخرة الفحم أو المبخرة الكهربائية لتعطير منزلك وملابسك وضيوفك.",
    ),
    howTo: n(
      "Place a small piece on hot charcoal or an electric mabkhara; let the smoke rise and pass it through clothes and rooms.",
      "ضع قطعة صغيرة على الفحم المشتعل أو المبخرة الكهربائية، واترك الدخان يتصاعد ومرّره على الملابس وفي أرجاء المنزل.",
    ),
    variants: [
      { sku: "MS-OUDCHIPS-1T", size: n("1 Tola · 11.7 g", "تولة واحدة · 11.7 غ"), priceFils: 15000, stock: 15 },
      { sku: "MS-OUDCHIPS-3T", size: n("3 Tola · 35 g", "3 تولات · 35 غ"), priceFils: 40000, stock: 8 },
    ],
    images: {
      card: "products/oud-chips/chips",
      gallery: ["products/oud-chips/chips", "renders/oud"],
    },
    related: ["oud", "dune", "ii", "oasis"],
    aliases: ["oud", "bakhoor", "bukhoor", "chips", "agarwood", "عود", "بخور", "تولة", "مبخرة"],
    todo: ["price", "size", "copy"],
  },
];

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug);

export const productBySku = (sku: string) => {
  for (const product of products) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
};

export const productsInCategory = (category: string) =>
  products.filter((p) => p.category === category || p.alsoIn?.some((c) => c === category));

export const trilogySlugs = ["i", "ii", "iii"] as const;
