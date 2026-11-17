import "server-only";

// In-memory throttle for the GUEST ORDER LOOKUP surface (src/server/actions/orders.ts). Patterned
// on src/server/auth/rate-limit.ts — process-local, lives on globalThis so it survives dev hot-
// reloads, size-capped so a flood of distinct keys can't grow it without bound, and pruned
// occasionally. A distributed/Redis store is Phase 9.
//
// Why key on the TARGET, not just the IP: order ids are sequential (MS-20000..) and the current max
// leaks via the checkout return URL, and the XFF-derived IP stays attacker-controllable until the
// Phase 9 reverse proxy. An IP-only limiter would not stop someone who knows a victim's phone from
// walking the id range (or who knows an id from guessing phones). So we throttle per-normalized-phone
// AND per-order-id, with a looser per-IP counter as defense-in-depth. On top of the 15-minute burst
// cap, a 24-HOUR cap per phone and per id blunts the slow id-band sweep (a known-phone attacker is
// otherwise limited only by 10/15min ≈ 960/day).
//
// HARD DIFFERENCE from the auth limiter: there is NO clear-on-success. Every attempt counts, forever
// within each window — an attacker must not be able to reset the counter by looking up their OWN
// order. And it FAILS CLOSED: any internal error, or a key that cannot be tracked because an axis is
// at capacity, is treated as throttled.

const WINDOW_MS = 15 * 60 * 1000; // short burst window
const DAY_MS = 24 * 60 * 60 * 1000; // slow-sweep window
const PHONE_MAX = 10; // attempts per phone / 15 min
const ID_MAX = 10; // attempts per order id / 15 min
const IP_MAX = 30; // attempts per IP / 15 min (looser; defense-in-depth)
const PHONE_DAY_MAX = 50; // attempts per phone / 24 h
const ID_DAY_MAX = 50; // attempts per order id / 24 h
const MAX_KEYS = 100_000; // per-axis ceiling on tracked keys (bounds memory under a key-rotation flood)
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

type Store = { phone: Axis; id: Axis; ip: Axis; phoneDay: Axis; idDay: Axis };

const store: Store = ((globalThis as typeof globalThis & { __msLookupRateLimit?: Store }).__msLookupRateLimit ??= {
  phone: newAxis(WINDOW_MS, PHONE_MAX),
  id: newAxis(WINDOW_MS, ID_MAX),
  ip: newAxis(WINDOW_MS, IP_MAX),
  phoneDay: newAxis(DAY_MS, PHONE_DAY_MAX),
  idDay: newAxis(DAY_MS, ID_DAY_MAX),
});

const allAxes = (): Axis[] => [store.phone, store.id, store.ip, store.phoneDay, store.idDay];

/** Drop keys from one axis whose newest timestamp has fallen outside that axis's window. */
function pruneAxis(axis: Axis, now: number): void {
  for (const [key, times] of axis.map) {
    if (!times.some((t) => now - t < axis.windowMs)) axis.map.delete(key);
  }
}

let lastGlobalPrune = 0;
function pruneOccasionally(now: number): void {
  if (now - lastGlobalPrune < WINDOW_MS) return;
  lastGlobalPrune = now;
  for (const axis of allAxes()) pruneAxis(axis, now);
}

/**
 * Make room in an axis at capacity. AMORTIZED: if a recent full prune freed nothing, skip the O(n)
 * rescan (a sustained flood of distinct LIVE keys) and let the caller fail closed, rather than scanning
 * the whole map on every new-key insert.
 */
function makeRoom(axis: Axis, now: number): boolean {
  if (now - axis.prune.at < PRUNE_COOLDOWN_MS && axis.prune.freed === 0) return false;
  const before = axis.map.size;
  pruneAxis(axis, now);
  axis.prune = { at: now, freed: before - axis.map.size };
  return axis.map.size < MAX_KEYS;
}

/**
 * Record one attempt against `key` in `axis` and report whether it is now OVER the axis's limit within
 * its window. Returns false for an absent key (nothing to count on this axis). FAILS CLOSED: a new key
 * that cannot be made room for is treated as throttled. Only the newest `max + 1` timestamps are kept,
 * so a hammered key cannot grow without bound.
 */
function hit(axis: Axis, key: string | null, now: number): boolean {
  if (!key) return false;
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

export type LookupTarget = {
  /** The normalized 8-digit phone, when it parsed to a valid Kuwaiti mobile; otherwise omit it. */
  phone?: string | null;
  /** The validated MS-… order number; otherwise omit it. */
  orderId?: string | null;
  /** The derived client IP (never empty — the IP helper returns "unknown" as a fallback). */
  ip: string;
};

/**
 * Records one lookup attempt against every applicable axis (phone / id / ip, in both the 15-minute and
 * 24-hour windows) and returns whether the attempt is now throttled. This is the SINGLE combined
 * "record + decide" entry point the brief permits, so the caller invokes it ONCE (recording and the
 * decision cannot disagree, and every attempt is counted exactly once). Keys are expected to be
 * pre-validated by the caller; empty keys are skipped on their axis. FAILS CLOSED on any internal error.
 */
export function recordAndCheckLookup(target: LookupTarget): boolean {
  try {
    const now = Date.now();
    pruneOccasionally(now);
    const phone = target.phone?.trim() || null;
    const orderId = target.orderId?.trim() || null;
    const ip = target.ip?.trim() || "unknown";
    // Evaluate ALL axes (array, no short-circuit) so every axis records this attempt even if one is
    // already over its limit; then throttle if ANY axis is over.
    const over = [
      hit(store.phone, phone, now),
      hit(store.id, orderId, now),
      hit(store.ip, ip, now),
      hit(store.phoneDay, phone, now),
      hit(store.idDay, orderId, now),
    ];
    return over.some(Boolean);
  } catch {
    return true; // fail closed — never let a limiter fault open the lookup surface
  }
}
