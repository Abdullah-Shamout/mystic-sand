import { setRequestLocale } from "next-intl/server";
import { products } from "@/data/products";

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: PageProps<"/[locale]/product/[slug]">) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <div className="p-10 font-serif text-title">{slug.toUpperCase()}</div>;
}
