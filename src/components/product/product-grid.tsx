import type { Product } from "@/data/types";
import { cn } from "@/lib/cn";
import { Reveal } from "@/components/ui/reveal";
import { ProductCard } from "./product-card";

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
        "grid grid-cols-2 border-s border-t border-ink/15",
        columns === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
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
