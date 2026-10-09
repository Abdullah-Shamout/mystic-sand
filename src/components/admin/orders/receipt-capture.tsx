"use client";

import { Download, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Invoice } from "@/components/payment/invoice";
import { Button } from "@/components/ui/button";
import { captureInvoicePdf, invoiceFileName } from "@/lib/admin/receipt";
import type { PaymentRecord } from "@/lib/payments/types";
import type { Order } from "@/store/checkout";
import { useUi } from "@/store/ui";

// Print leaves only the invoice: everything except the portal wrapper is hidden (pattern from
// result-success.tsx). The wrapper is appended to <body>, so it survives as the last child.
const PRINT_CSS = `@media print {
  @page { margin: 14mm; }
  body > *:not([data-print-receipt]) { display: none !important; }
  [data-print-receipt] { display: block !important; }
}`;

/**
 * Receipt actions (download PDF, print). Both are disabled until the order has a payment attempt.
 * For the PDF the invoice is rendered off-screen as a visible block, captured once the fonts are
 * ready, then unmounted. jsPDF and html-to-image load only on click.
 */
export function ReceiptActions({
  order,
  attempt,
  className,
}: {
  order: Order;
  attempt: PaymentRecord | null;
  className?: string;
}) {
  const t = useTranslations("admin");
  const pushToast = useUi((s) => s.pushToast);
  const captureRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!pdfBusy || !attempt) return;
    let cancelled = false;
    (async () => {
      const node = captureRef.current;
      if (!node) {
        setPdfBusy(false);
        return;
      }
      try {
        if (document.fonts?.ready) await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await captureInvoicePdf(node, invoiceFileName(order.id));
      } catch {
        pushToast({ title: t("orders.exportError") });
      } finally {
        if (!cancelled) setPdfBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfBusy, attempt, order.id, pushToast, t]);

  useEffect(() => {
    if (!printing) return;
    const id = requestAnimationFrame(() => {
      window.print();
      setPrinting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [printing]);

  const disabled = !attempt;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        busy={pdfBusy}
        onClick={() => setPdfBusy(true)}
        className={className}
        data-testid="receipt-pdf"
      >
        <Download className="size-4" strokeWidth={1.5} aria-hidden />
        {t("orders.drawer.downloadPdf")}
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setPrinting(true)} className={className}>
        <Printer className="size-4" strokeWidth={1.5} aria-hidden />
        {t("orders.drawer.printReceipt")}
      </Button>

      {pdfBusy && attempt && (
        // Off-screen WRAPPER carries the fixed positioning; the INNER node is laid out normally
        // (position: static, explicit width) so html-to-image captures it at the origin.
        <div
          aria-hidden
          style={{ position: "fixed", insetInlineStart: "-10000px", top: 0, zIndex: -1, pointerEvents: "none" }}
        >
          <div
            ref={captureRef}
            data-testid="receipt-capture"
            style={{
              position: "static",
              width: "794px",
              boxSizing: "border-box",
              padding: "14mm",
              background: "#ffffff",
            }}
          >
            <Invoice order={order} attempt={attempt} variant="document" />
          </div>
        </div>
      )}

      {printing &&
        attempt &&
        typeof document !== "undefined" &&
        createPortal(
          <div data-print-receipt>
            <style>{PRINT_CSS}</style>
            <Invoice order={order} attempt={attempt} variant="print" />
          </div>,
          document.body,
        )}
    </>
  );
}
