import type { Product } from "@/data/types";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/ui/reveal";
import { ProductCard } from "./product-card";

// A small collection (fewer products than columns) narrows and centres the grid, so
// the cards keep their usual size instead of one card hugging the start edge.
const NARROW: Record<3 | 4, Record<number, string>> = {
  4: { 1: "lg:w-1/4", 2: "lg:w-1/2 lg:grid-cols-2", 3: "lg:w-3/4 lg:grid-cols-3" },
  3: { 1: "lg:w-1/3", 2: "lg:w-2/3 lg:grid-cols-2" },
};

/**
 * Amouage's edge-to-edge catalogue grid: no gutters, shared hairlines, 4 columns on
 * desktop and 2 below. Logical borders mirror correctly in Arabic.
 */
export function ProductGrid({
  products,
  className,
  priorityCount = 0,
  columns = 4,
}: {
  products: Product[];
  className?: string;
  priorityCount?: number;
  columns?: 3 | 4;
}) {
  return (
    <ul
      className={cn(
        "grid border-s border-t border-ink/15",
        products.length === 1 ? "mx-auto grid-cols-1 sm:w-1/2" : "grid-cols-2",
        products.length < columns
          ? cn("mx-auto", NARROW[columns][products.length])
          : columns === 4
            ? "lg:grid-cols-4"
            : "lg:grid-cols-3",
        className,
      )}
    >
      {products.map((p, i) => (
        <li key={p.slug} className="border-e border-b border-ink/15">
          <Reveal index={i % columns} className="h-full">
            <ProductCard product={p} priority={i < priorityCount} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
