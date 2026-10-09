// IDs are created in event handlers only (never during render).
import { kuwaitClock } from "./delivery";

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/**
 * Track ID shown to the shopper and sent to KNET as `trackid`. Real orders use MS-20000..99999
 * (sample orders reserve 10000–19999). `existing` (e.g. the checkout store's orders) is skipped
 * so two orders never collide. Called only from event handlers (uses Math.random).
 */
export function newTrackId(existing?: Readonly<Record<string, unknown>>): string {
  for (let i = 0; i < 50; i++) {
    const id = `MS-${20000 + Math.floor(Math.random() * 80000)}`;
    if (!existing || !(id in existing)) return id;
  }
  return `MS-${20000 + Math.floor(Math.random() * 80000)}`;
}

/** Realistic-looking KNET return fields for the simulation. */
export function newPaymentFields(now: Date) {
  const clock = kuwaitClock(now);
  return {
    paymentId: `100${digits(15)}`,
    tranId: digits(15),
    ref: digits(12),
    auth: digits(6),
    postDate: `${String(clock.month).padStart(2, "0")}${String(clock.day).padStart(2, "0")}`,
  };
}

export function demoOtp(): string {
  return digits(6);
}
