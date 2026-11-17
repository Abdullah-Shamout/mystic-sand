import "server-only";

// In-memory IP throttle for the public CONTACT submission action (src/server/actions/contact.ts).
// Modeled on src/server/orders/lookup-rate-limit.ts — process-local, lives on globalThis so it
// survives dev hot-reloads, size-capped so a flood of distinct IPs can't grow it without bound, pruned
// occasionally, and FAILS CLOSED: any internal error, or a new key that cannot be tracked because the
// store is at capacity, is treated as throttled. A distributed/Redis store is Phase 9.
//
// SINGLE axis — IP only. Unlike order lookup (which also keys on the phone and order id it is probing),
// contact has no per-target secret to defend: the limiter's whole job is to blunt a submission flood
// from one source. Every attempt counts (there is no clear-on-success), so a caller cannot reset its
// own counter by submitting a valid message. The XFF-derived IP is attacker-controllable until the
// Phase 9 reverse proxy, so this is abuse-dampening, not a hard security boundary.

const WINDOW_MS = 15 * 60 * 1000; // 15-minute window
const IP_MAX = 5; // attempts per IP / 15 min
const MAX_KEYS = 100_000; // ceiling on tracked keys (bounds memory under an IP-rotation flood)
const PRUNE_COOLDOWN_MS = 60 * 1000; // after a full prune frees nothing, don't rescan for this long

type Axis = {
  map: Map<string, number[]>;
  windowMs: number;
  max: number;
  /** Bookkeeping for the amortized capacity prune: when it last ran and how many keys it freed. */
  prune: { at: number; freed: number };
};

function newAxis(windowMs: number, max: number): Axis {
  return { map: new Map(), windowMs, max, prune: { at: 0, freed: 1 } };
}

type Store = { ip: Axis };

const store: Store = ((globalThis as typeof globalThis & { __msContactRateLimit?: Store }).__msContactRateLimit ??= {
  ip: newAxis(WINDOW_MS, IP_MAX),
});

/** Drop keys from the axis whose newest timestamp has fallen outside the window. */
function pruneAxis(axis: Axis, now: number): void {
  for (const [key, times] of axis.map) {
    if (!times.some((t) => now - t < axis.windowMs)) axis.map.delete(key);
  }
}

let lastGlobalPrune = 0;
function pruneOccasionally(now: number): void {
  if (now - lastGlobalPrune < WINDOW_MS) return;
  lastGlobalPrune = now;
  pruneAxis(store.ip, now);
}

/**
 * Make room in an axis at capacity. AMORTIZED: if a recent full prune freed nothing, skip the O(n)
 * rescan (a sustained flood of distinct LIVE keys) and let the caller fail closed.
 */
function makeRoom(axis: Axis, now: number): boolean {
  if (now - axis.prune.at < PRUNE_COOLDOWN_MS && axis.prune.freed === 0) return false;
  const before = axis.map.size;
  pruneAxis(axis, now);
  axis.prune = { at: now, freed: before - axis.map.size };
  return axis.map.size < MAX_KEYS;
}

/**
 * Record one attempt against `key` and report whether it is now OVER the limit within the window.
 * FAILS CLOSED: a new key that cannot be made room for is treated as throttled. Only the newest
 * `max + 1` timestamps are kept, so a hammered key cannot grow without bound.
 */
function hit(axis: Axis, key: string, now: number): boolean {
  let times = axis.map.get(key);
  if (!times) {
    if (axis.map.size >= MAX_KEYS && !makeRoom(axis, now)) return true;
    times = [];
    axis.map.set(key, times);
  }
  const live = times.filter((t) => now - t < axis.windowMs);
  live.push(now);
  axis.map.set(key, live.length > axis.max + 1 ? live.slice(-(axis.max + 1)) : live);
  return live.length > axis.max;
}

/**
 * Records one contact-submission attempt for `ip` and returns whether it is now throttled. The SINGLE
 * combined "record + decide" entry point, so the caller invokes it ONCE per attempt (recording and the
 * decision cannot disagree). FAILS CLOSED on any internal error.
 */
export function recordAndCheckContact(ip: string): boolean {
  try {
    const now = Date.now();
    pruneOccasionally(now);
    const key = ip.trim() || "unknown";
    return hit(store.ip, key, now);
  } catch {
    return true; // fail closed — never let a limiter fault open the contact surface
  }
}
