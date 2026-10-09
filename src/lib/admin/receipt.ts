import { downloadBlob } from "@/lib/download";

// Renders a DOM invoice to a PDF. jsPDF and html-to-image load only on click (dynamic import),
// so the storefront bundles never include them. The browser paints the node itself, so Arabic
// shaping and color-mix() colours survive — html2canvas does not handle those.
//
// `node` must be a normally-laid-out (position: static) element with an explicit width; the
// off-screen wrapper around it keeps the fixed positioning off the captured clone, which would
// otherwise render the content outside the canvas (a blank page). The image is embedded as JPEG
// so the file stays small (a one-page receipt is a few hundred KB, not several MB of PNG).

const A4 = { width: 595.28, height: 841.89 }; // points, portrait

export async function captureInvoicePdf(node: HTMLElement, filename: string): Promise<void> {
  const [{ toCanvas }, jspdf] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const canvas = await toCanvas(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    // Force the clone to lay out at the origin, ignoring any off-screen positioning.
    style: { position: "static", left: "0", top: "0", margin: "0", transform: "none" },
  });

  const JsPdf =
    (jspdf as { jsPDF?: typeof import("jspdf").jsPDF }).jsPDF ??
    (jspdf as { default: typeof import("jspdf").jsPDF }).default;
  const pdf = new JsPdf({ orientation: "portrait", unit: "pt", format: "a4" });

  // Canvas pixels per PDF point, so each page renders a full-width A4-height slice.
  const scale = canvas.width / A4.width;
  const pageHeightPx = Math.max(1, Math.floor(A4.height * scale));

  let offset = 0;
  let firstPage = true;
  while (offset < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - offset);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
    }
    const imgData = slice.toDataURL("image/jpeg", 0.92);
    if (!firstPage) pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, 0, A4.width, sliceHeight / scale);
    offset += sliceHeight;
    firstPage = false;
  }

  downloadBlob(pdf.output("blob"), filename);
}

/** `Mystic-Sand-Invoice-MS-10482.pdf` */
export const invoiceFileName = (orderId: string): string => `Mystic-Sand-Invoice-${orderId}.pdf`;
