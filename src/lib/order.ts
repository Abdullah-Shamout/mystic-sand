// IDs are created in event handlers only (never during render).
import { kuwaitClock } from "./delivery";

const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

/** Track ID shown to the shopper and sent to KNET as `trackid`. */
export function newTrackId(): string {
  return `MS-${10000 + Math.floor(Math.random() * 90000)}`;
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
