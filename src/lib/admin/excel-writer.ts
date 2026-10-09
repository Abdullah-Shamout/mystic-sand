import type { Locale } from "@/i18n/routing";
import { downloadBlob } from "@/lib/download";
import { buildOrdersExport, ordersFileName } from "./excel";
import type { AdminOrder, Filters, Kpis } from "./orders";

// Loads write-excel-file only when the admin clicks "Export", so the storefront bundles never
// include it (nor fflate). Builds the workbook from the current filtered rows and saves it.

export async function exportOrders(input: {
  rows: AdminOrder[];
  kpis: Kpis;
  filters: Filters;
  locale: Locale;
  now: Date;
}): Promise<void> {
  const sheets = buildOrdersExport(input);
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  // Our XlsxSheet shape matches write-excel-file's Sheet; the cast bridges the two typings.
  const blob = await writeExcelFile(sheets as never).toBlob();
  downloadBlob(blob, ordersFileName(input.now));
}
