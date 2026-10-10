import { getLiveCatalog } from "@/lib/live";
import { availableFor } from "@/lib/stock";
import { useBag } from "@/store/bag";
import { useCheckout, type Order } from "@/store/checkout";
import { useStockStore } from "@/store/stock";

// Capture-time stock guard. There is no server, so every path that can finish a purchase re-checks
// availability at the moment the payment is captured — not only when "Pay" was pressed. This also
// stops two tabs of the same browser from both selling the last unit: a paid order whose sale has
// not been recorded yet (another tab mid-capture) still reserves its units here.

/**
 * Units of a SKU that may still be captured right now: the live availability (set stock − sold)
 * minus the units already committed by OTHER orders that are paid but not yet finalized (their sale
 * is recorded into the ledger on the result page). The order being captured is excluded.
 */
export function captureAvailable(sku: string, excludeOrderId: string): number {
  const base = availableFor(getLiveCatalog(), useStockStore.getState().sold, sku);
  let reserved = 0;
  for (const other of Object.values(useCheckout.getState().orders)) {
    if (other.id === excludeOrderId) continue;
    if (other.status !== "paid" || other.finalizedAt) continue;
    for (const line of other.lines) if (line.sku === sku) reserved += line.qty;
  }
  return base - reserved;
}

/** True when an order's lines exceed what can still be captured — the payment must be refused. */
export function orderExceedsStock(order: Order): boolean {
  return order.lines.some((line) => line.qty > captureAvailable(line.sku, order.id));
}

/**
 * Brings the bag down to what is actually available (an out-of-stock line is left for the bag page
 * to flag and clear). Called when a capture is refused so the shopper lands on an accurate bag.
 */
export function clampBagToStock(): void {
  const catalog = getLiveCatalog();
  const sold = useStockStore.getState().sold;
  const { lines, setQty } = useBag.getState();
  for (const line of lines) {
    const available = availableFor(catalog, sold, line.sku);
    if (available > 0 && line.qty > available) setQty(line.sku, available);
  }
}
