import "server-only";

// In-memory IP throttle for the public CONTACT submission action (src/server/actions/contact.ts).
// Modeled on src/server/orders/lookup-rate-limit.ts — process-local, lives on globalThis so it
// survives dev hot-reloads, size-capped so a flood of distinct IPs can't grow it without bound, pruned
// occasionally, and FAILS CLOSED: any internal error is treated as throttled. A distributed/Redis store
// is Phase 9.
//
// SINGLE axis — IP only. Unlike order lookup (which also keys on the phone and order id it is probing),
// contact has no per-target secret to defend: the limiter's whole job is to blunt a submission flood
// from one source. Every attempt counts (there is no clear-on-success), so a caller cannot reset its
// own counter by submitting a valid message. The IP key is normalized by the caller via ipRateLimitKey;
// it is attacker-controllable until the Phase 9 reverse proxy, so this is abuse-dampening, not a hard
// security boundary.
//
// Phase-10 security fix: the IP axis uses CAREFUL CAPACITY EVICTION instead of failing closed when it
// reaches MAX_KEYS. An IP-rotation flood would otherwise fill the axis and lock out every fresh legit
// IP (a store-wide submission denial). At capacity we now evict the lowest-live-count, oldest-first key
// but NEVER one at or over its limit, so a throttled source is never reset while a flood of fresh
// count-1 keys evicts itself; if every key is protected, the new key fails closed (cap never exceeded).

export type LimiterConfig = {
  windowMs: number; // window length
  ipMax: number; // attempts per IP / windowMs
  maxKeys: number; // ceiling on tracked keys (bounds memory under an IP-rotation flood)
  pruneCooldownMs: number; // after a reclaim pass frees nothing, don't rescan for this long
  now: () => number; // injectable clock (tests); defaults to Date.now
};

const DEFAULTS: LimiterConfig = {
  windowMs: 15 * 60 * 1000,
  ipMax: 5,
  maxKeys: 100_000,
  pruneCooldownMs: 60 * 1000,
  now: Date.now,
};

// Evict ~1/16 of the ceiling per O(n) reclaim pass so the scan is amortized across that many inserts
// (a per-insert scan would swap the lockout DoS for a CPU DoS). At least one key, for tiny test caps.
const EVICT_BATCH_DIVISOR = 16;

type Axis = {
  map: Map<string, number[]>;
  windowMs: number;
  max: number;
  /** Bookkeeping for the amortized capacity reclaim: when it last ran and how many keys it freed. */
  prune: { at: number; freed: number };
};

function newAxis(windowMs: number, max: number): Axis {
  return { map: new Map(), windowMs, max, prune: { at: 0, freed: 1 } };
}

type Store = { ip: Axis };

function createStore(cfg: LimiterConfig): Store {
  return { ip: newAxis(cfg.windowMs, cfg.ipMax) };
}

export type ContactLimiter = {
  recordAndCheckContact: (ip: string) => boolean;
  /** TEST-ONLY introspection: the raw axis map, so tests can assert sizes / key presence. */
  store: Store;
};

function createLimiter(store: Store, cfg: LimiterConfig): ContactLimiter {
  let lastGlobalPrune = 0;

  function liveCount(times: number[], now: number, windowMs: number): number {
    let n = 0;
    for (const t of times) if (now - t < windowMs) n++;
    return n;
  }

  /** Drop keys from the axis whose newest timestamp has fallen outside the window. */
  function pruneAxis(axis: Axis, now: number): void {
    for (const [key, times] of axis.map) {
      if (!times.some((t) => now - t < axis.windowMs)) axis.map.delete(key);
    }
  }

  function pruneOccasionally(now: number): void {
    if (now - lastGlobalPrune < cfg.windowMs) return;
    lastGlobalPrune = now;
    pruneAxis(store.ip, now);
  }

  /**
   * Make room in an axis at capacity by CAREFUL eviction. One pass in Map order (oldest-first — an
   * in-place set() on an existing key does NOT reorder it): find the lowest-live-count bucket among
   * UNPROTECTED keys (live count < max; dead count-0 keys go first) and evict a batch of its oldest keys.
   * A key at or over its limit (live count >= max) is PROTECTED and never evicted. AMORTIZED: when the
   * previous pass freed nothing (everything protected) we fail closed within the cooldown rather than
   * rescanning on every insert, keeping memory bounded.
   */
  function makeRoom(axis: Axis, now: number): boolean {
    if (now - axis.prune.at < cfg.pruneCooldownMs && axis.prune.freed === 0) return false;

    const batch = Math.max(1, Math.floor(cfg.maxKeys / EVICT_BATCH_DIVISOR));
    let minCount = Infinity;
    let victims: string[] = [];
    for (const [key, times] of axis.map) {
      const live = liveCount(times, now, axis.windowMs);
      if (live >= axis.max) continue; // protected — never reset an at/over-limit key
      if (live < minCount) {
        minCount = live;
        victims = [key];
      } else if (live === minCount && victims.length < batch) {
        victims.push(key); // oldest-first within the lowest bucket (Map iteration order)
      }
    }
    if (victims.length === 0) {
      axis.prune = { at: now, freed: 0 }; // everything is at/over limit — fail closed, cap not exceeded
      return false;
    }
    for (const key of victims) axis.map.delete(key);
    axis.prune = { at: now, freed: victims.length };
    return true;
  }

  /**
   * Record one attempt against `key` and report whether it is now OVER the limit within the window.
   * FAILS CLOSED when a new key cannot be made room for. Only the newest `max + 1` timestamps are kept,
   * so a hammered key cannot grow without bound.
   */
  function hit(axis: Axis, key: string, now: number): boolean {
    let times = axis.map.get(key);
    if (!times) {
      if (axis.map.size >= cfg.maxKeys && !makeRoom(axis, now)) return true;
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
  function recordAndCheckContact(ip: string): boolean {
    try {
      const now = cfg.now();
      pruneOccasionally(now);
      const key = ip.trim() || "unknown";
      return hit(store.ip, key, now);
    } catch {
      return true; // fail closed — never let a limiter fault open the contact surface
    }
  }

  return { recordAndCheckContact, store };
}

// Prod singleton. Only the DATA (the Map) lives on globalThis so it survives dev hot-reloads; the LOGIC
// (the closures) is rebuilt on every module load, so a hot-reload picks up new code instead of a stale
// closure frozen by `??=`.
const store: Store = ((globalThis as typeof globalThis & { __msContactRateLimit?: Store }).__msContactRateLimit ??=
  createStore(DEFAULTS));
const prod = createLimiter(store, DEFAULTS);

export const recordAndCheckContact = prod.recordAndCheckContact;

/** TEST-ONLY: build an ISOLATED limiter (its own store, injectable config) for unit tests. Never used in
 * production code — the prod path above exports only recordAndCheckContact. */
export function __createContactLimiterForTest(overrides: Partial<LimiterConfig> = {}): ContactLimiter {
  const cfg = { ...DEFAULTS, ...overrides };
  return createLimiter(createStore(cfg), cfg);
}
