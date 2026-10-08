// Primary navigation (Amouage pattern: centred row, text-only dropdowns).
// Labels are keys in messages/*/common.json → nav.*; product names stay Latin.

export type NavLink = { href: string; label?: string; name?: string };
export type NavItem = { key: string; label: string; href: string; children?: NavLink[] };

export const navItems: NavItem[] = [
  {
    key: "perfumes",
    label: "perfumes",
    href: "/shop/eau-de-parfum",
    children: [
      { href: "/shop/eau-de-parfum", label: "trilogy" },
      { href: "/product/i", name: "I" },
      { href: "/product/ii", name: "II" },
      { href: "/product/iii", name: "III" },
      { href: "/product/cafe", name: "CAFÉ" },
      { href: "/product/oud", name: "OUD" },
      { href: "/shop/eau-de-parfum", label: "allPerfumes" },
    ],
  },
  { key: "body", label: "body", href: "/shop/body" },
  {
    key: "home",
    label: "home",
    href: "/shop/home",
    children: [
      { href: "/shop/home", label: "roomSprays" },
      { href: "/product/oasis", name: "Oasis" },
      { href: "/product/mist", name: "Mist" },
      { href: "/product/dune", name: "Dune" },
      { href: "/product/oud-chips", label: "oudChips" },
      { href: "/shop/home", label: "allHome" },
    ],
  },
  { key: "gifts", label: "gifts", href: "/shop/gift-sets" },
  { key: "story", label: "story", href: "/our-story" },
];
