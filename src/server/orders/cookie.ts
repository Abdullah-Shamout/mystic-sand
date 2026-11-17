import "server-only";

// The per-order ownership cookie. initiateCheckout sets `ms_co_<orderId>` to the order's random
// checkoutToken (httpOnly); the /checkout/result render reads it back and getOrderForResult compares
// it to orders.checkoutToken before showing the receipt. Per-ORDER (not one shared cookie) so a
// second checkout in the same browser does not clobber the first order's token — older receipts stay
// reachable within the cookie's lifetime.
//
// Lives in its own module because a "use server" file may only export async functions, yet both the
// checkout action and the result page (a Server Component) need these.

export const CHECKOUT_COOKIE_PREFIX = "ms_co_";

export function checkoutCookieName(orderId: string): string {
  return `${CHECKOUT_COOKIE_PREFIX}${orderId}`;
}
