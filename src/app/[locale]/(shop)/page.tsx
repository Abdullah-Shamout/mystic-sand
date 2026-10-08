import { setRequestLocale } from "next-intl/server";
import { ProductGrid } from "@/components/product/product-grid";
import { SectionTitle } from "@/components/ui/section-title";
import { products } from "@/data/products";

// Temporary placeholder — replaced by the home page workstream.
export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SectionTitle title="The Trilogy" />
      <ProductGrid products={products.slice(0, 4)} priorityCount={4} />
      <SectionTitle title="For the home" />
      <ProductGrid products={products.slice(7, 11)} />
    </>
  );
}
