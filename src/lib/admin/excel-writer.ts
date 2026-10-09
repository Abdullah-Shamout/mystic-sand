import type { Locale } from "@/i18n/routing";
import { downloadBlob } from "@/lib/download";
import type { AnalysisFilters, CategorySection, ProductAnalysis } from "./analytics";
import {
  analysisFileName,
  buildAllCategoriesExport,
  buildCategoryExport,
  buildOrdersExport,
  categoryFileName,
  ordersFileName,
  type XlsxSheet,
} from "./excel";
import type { AdminOrder, Filters, Kpis } from "./orders";

// Loads write-excel-file only when the admin clicks "Export", so the storefront bundles never
// include it (nor fflate). Builds the workbook from the current filtered rows and saves it.

/** Turns the pure sheet specs into a Blob and saves it; the only place write-excel-file loads. */
async function writeSheets(sheets: XlsxSheet[], fileName: string): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  // Our XlsxSheet shape matches write-excel-file's Sheet; the cast bridges the two typings.
  const blob = await writeExcelFile(sheets as never).toBlob();
  downloadBlob(blob, fileName);
}

export async function exportOrders(input: {
  rows: AdminOrder[];
  kpis: Kpis;
  filters: Filters;
  locale: Locale;
  now: Date;
}): Promise<void> {
  await writeSheets(buildOrdersExport(input), ordersFileName(input.now));
}

export async function exportCategory(input: {
  section: CategorySection;
  filters: AnalysisFilters;
  locale: Locale;
  now: Date;
}): Promise<void> {
  await writeSheets(buildCategoryExport(input), categoryFileName(input.section.slug, input.now));
}

export async function exportAllCategories(input: {
  analysis: ProductAnalysis;
  filters: AnalysisFilters;
  locale: Locale;
  now: Date;
}): Promise<void> {
  await writeSheets(buildAllCategoriesExport(input), analysisFileName(input.now));
}
