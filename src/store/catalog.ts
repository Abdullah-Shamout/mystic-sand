"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CategorySlug, Product } from "@/data/types";
import {
  baseCatalog,
  buildCatalog,
  EMPTY_EDITS,
  isCustomSlug,
  patchFor,
  type CatalogEdits,
  type CategoryPatch,
} from "@/lib/catalog";
import { safeJSONStorage } from "@/lib/storage";

type CatalogState = {
  edits: CatalogEdits;
  /** Base product → store the minimal patch (removed when empty); custom product → replace it. */
  saveProduct: (slug: string, edited: Product) => void;
  createProduct: (product: Product) => void;
  setHidden: (slug: string, hidden: boolean) => void;
  /** Sets one variant's stock (the "set value" the stock ledger counts sales against). */
  setVariantStock: (sku: string, stock: number) => void;
  setCategory: (slug: string, category: CategorySlug, alsoIn?: CategorySlug[]) => void;
  /** Drops a base product's patch, restoring the original. */
  resetProduct: (slug: string) => void;
  /** Removes a custom (admin-added) product. */
  deleteProduct: (slug: string) => void;
  saveCategory: (slug: CategorySlug, patch: CategoryPatch) => void;
  resetAll: () => void;
};

/** Stored edits may be from an older build or hand-edited: force the top-level shape. */
function coerceEdits(value: unknown): CatalogEdits {
  if (!value || typeof value !== "object") return EMPTY_EDITS;
  const v = value as Partial<CatalogEdits>;
  const isPlain = (o: unknown): o is Record<string, unknown> =>
    !!o && typeof o === "object" && !Array.isArray(o);
  return {
    patches: isPlain(v.patches) ? (v.patches as CatalogEdits["patches"]) : {},
    added: Array.isArray(v.added) ? v.added : [],
    categories: isPlain(v.categories) ? (v.categories as CatalogEdits["categories"]) : {},
  };
}

export const useCatalogStore = create<CatalogState>()(
  persist(
    (set, get) => {
      /** Rewrites a base product's patch from a mutated copy of its current (edited) state. */
      const writeBase = (slug: string, mutate: (p: Product) => Product) => {
        const base = baseCatalog.bySlug.get(slug);
        if (!base) return;
        const edits = get().edits;
        const current = buildCatalog(edits).bySlug.get(slug) ?? base;
        const patch = patchFor(base, mutate({ ...current }));
        const patches = { ...edits.patches };
        if (Object.keys(patch).length === 0) delete patches[slug];
        else patches[slug] = patch;
        set({ edits: { ...edits, patches } });
      };

      const writeCustom = (slug: string, mutate: (p: Product) => Product) => {
        const edits = get().edits;
        set({
          edits: { ...edits, added: edits.added.map((p) => (p.slug === slug ? mutate({ ...p }) : p)) },
        });
      };

      const withoutOwnCategory = (p: Product): Product => {
        if (p.alsoIn) {
          const filtered = p.alsoIn.filter((c) => c !== p.category);
          return { ...p, alsoIn: filtered.length > 0 ? filtered : undefined };
        }
        return p;
      };

      const setCategory = (slug: string, category: CategorySlug, alsoIn?: CategorySlug[]) => {
        const mutate = (p: Product): Product => {
          const next: Product = { ...p, category };
          if (alsoIn) {
            const filtered = [...new Set(alsoIn.filter((c) => c !== category))];
            next.alsoIn = filtered.length > 0 ? filtered : undefined;
          }
          return withoutOwnCategory(next);
        };
        if (isCustomSlug(slug)) writeCustom(slug, mutate);
        else writeBase(slug, mutate);
      };

      return {
        edits: EMPTY_EDITS,

        saveProduct: (slug, edited) => {
          if (isCustomSlug(slug)) {
            const edits = get().edits;
            set({ edits: { ...edits, added: edits.added.map((p) => (p.slug === slug ? edited : p)) } });
            return;
          }
          const base = baseCatalog.bySlug.get(slug);
          if (!base) return;
          const edits = get().edits;
          const patch = patchFor(base, edited);
          const patches = { ...edits.patches };
          if (Object.keys(patch).length === 0) delete patches[slug];
          else patches[slug] = patch;
          set({ edits: { ...edits, patches } });
        },

        createProduct: (product) => {
          const edits = get().edits;
          set({ edits: { ...edits, added: [...edits.added, product] } });
        },

        setHidden: (slug, hidden) => {
          const mutate = (p: Product): Product => {
            const next = { ...p };
            if (hidden) next.hidden = true;
            else delete next.hidden;
            return next;
          };
          if (isCustomSlug(slug)) writeCustom(slug, mutate);
          else writeBase(slug, mutate);
        },

        setVariantStock: (sku, stock) => {
          const value = Math.max(0, Math.round(stock));
          const hit = buildCatalog(get().edits).bySku.get(sku);
          if (!hit) return;
          const slug = hit.product.slug;
          const mutate = (p: Product): Product => ({
            ...p,
            variants: p.variants.map((v) => (v.sku === sku ? { ...v, stock: value } : v)),
          });
          if (isCustomSlug(slug)) writeCustom(slug, mutate);
          else writeBase(slug, mutate);
        },

        setCategory,

        resetProduct: (slug) => {
          const edits = get().edits;
          if (!(slug in edits.patches)) return;
          const patches = { ...edits.patches };
          delete patches[slug];
          set({ edits: { ...edits, patches } });
        },

        deleteProduct: (slug) => {
          if (!isCustomSlug(slug)) return;
          const edits = get().edits;
          set({ edits: { ...edits, added: edits.added.filter((p) => p.slug !== slug) } });
        },

        saveCategory: (slug, patch) => {
          const edits = get().edits;
          set({ edits: { ...edits, categories: { ...edits.categories, [slug]: patch } } });
        },

        resetAll: () => set({ edits: EMPTY_EDITS }),
      };
    },
    {
      name: "ms-catalog",
      version: 1,
      storage: safeJSONStorage,
      partialize: (s) => ({ edits: s.edits }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { edits?: unknown };
        return { ...current, edits: coerceEdits(p.edits) };
      },
    },
  ),
);
