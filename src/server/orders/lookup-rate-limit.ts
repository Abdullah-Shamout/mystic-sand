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
// order. And it FAILS CLOSED: any internal error is treated as throttled.
//
// Phase-10 security fix (capacity-lockout DoS + IP-first admission):
//   • IP-FIRST ADMISSION. The IP axis is evaluated FIRST. If the IP is already OVER its cap, the attempt
//     is throttled WITHOUT recording the per-target (phone/phoneDay/id/idDay) axes — only the IP axis is
//     recorded, so the IP stays throttled. Because a single IP can therefore add at most IP_MAX target
//     keys per window before being shut out, ONE IP can no longer slow-fill the 24h phone/id axes to
//     MAX_KEYS (the old store-wide guest-lookup denial). An ADMITTED request (IP under cap) still records
//     + checks EVERY axis, so a DISTRIBUTED attack on one victim phone/id still trips those axes.
//   • HYBRID CAPACITY EVICTION (per-axis mode) replaces the old fail-closed-at-capacity behaviour.
//     - TARGET axes (phone / id / phoneDay / idDay): DEAD-ONLY. At capacity we evict ONLY DEAD keys (live
//       count 0 — every timestamp already outside the window, exactly what pruneAxis would drop). A key
//       with ANY live hit is NEVER evicted, because evicting a live key RESETS its throttle counter: a key
//       CLIMBING toward its limit is a sweep victim, and resetting it re-opens the per-target enumeration
//       bypass (pin every other key one notch ABOVE the victim's count → the victim is the global minimum →
//       evicted → reset to absent → re-inserted at 1 → it never reaches the throttle). Full of live keys →
//       the new key FAILS CLOSED. IP-first admission already stops a single IP from filling these axes, so
//       dead-only + fail-closed cannot reintroduce the old single-IP lockout; a distributed/spoofed
//       live-key flood that fills a target axis → fail-closed is the tracked Phase-9 residual.
//     - IP axis: CAREFUL (lowest-live-count, oldest-first), never evicting a key AT/OVER its limit. There
//       is NO per-target victim on the IP axis, so resetting a CLIMBING ip key via eviction is harmless —
//       an attacker who can fill the IP axis is spoofing XFF and already evades their own IP throttle (⊆
//       the tracked Phase-9 XFF residual, no NEW bypass). Careful eviction keeps a count-1 flood from
//       locking out fresh IPs (the availability cost dead-only-on-the-IP-axis would add), while the
//       at/over-limit guard still means an already-throttled IP is never reset.

export type LimiterConfig = {
  windowMs: number; // short burst window
  dayMs: number; // slow-sweep window
  phoneMax: number; // attempts per phone / windowMs
  idMax: number; // attempts per order id / windowMs
  ipMax: number; // attempts per IP / windowMs (looser; defense-in-depth + admission gate)
  phoneDayMax: number; // attempts per phone / dayMs
  idDayMax: number; // attempts per order id / dayMs
  maxKeys: number; // per-axis ceiling on tracked keys (bounds memory under a key-rotation flood)
  pruneCooldownMs: number; // after a reclaim pass frees nothing, don't rescan for this long
  now: () => number; // injectable clock (tests); defaults to Date.now
};

const DEFAULTS: LimiterConfig = {
  windowMs: 15 * 60 * 1000,
  dayMs: 24 * 60 * 60 * 1000,
  phoneMax: 10,
  idMax: 10,
  ipMax: 30,
  phoneDayMax: 50,
  idDayMax: 50,
  maxKeys: 100_000,
  pruneCooldownMs: 60 * 1000,
  now: Date.now,
};

// Evict ~1/16 of the ceiling per CAREFUL reclaim pass (IP axis only) so the O(n) scan is amortized across
// that many inserts. At least one key, for tiny test caps. (The dead-only target axes evict all dead keys
// per pass and gate rescans on time instead.)
const EVICT_BATCH_DIVISOR = 16;

/** Per-axis capacity-eviction mode (see the HYBRID note above): "dead" = evict only dead keys, never a
 * live/climbing key (TARGET axes, where a reset would be a per-target sweep bypass); "careful" = evict the
 * lowest-live-count key but never one at/over its limit (IP axis, where a reset is harmless). */
type EvictMode = "dead" | "careful";

type Axis = {
  map: Map<string, number[]>;
  windowMs: number;
  max: number;
  evict: EvictMode;
  /** Bookkeeping for the amortized capacity reclaim: when it last ran and how many keys it freed. */
  prune: { at: number; freed: number };
};

function newAxis(windowMs: number, max: number, evict: EvictMode): Axis {
  return { map: new Map(), windowMs, max, evict, prune: { at: 0, freed: 1 } };
}

type Store = { phone: Axis; id: Axis; ip: Axis; phoneDay: Axis; idDay: Axis };

function createStore(cfg: LimiterConfig): Store {
  return {
    phone: newAxis(cfg.windowMs, cfg.phoneMax, "dead"),
    id: newAxis(cfg.windowMs, cfg.idMax, "dead"),
    ip: newAxis(cfg.windowMs, cfg.ipMax, "careful"),
    phoneDay: newAxis(cfg.dayMs, cfg.phoneDayMax, "dead"),
    idDay: newAxis(cfg.dayMs, cfg.idDayMax, "dead"),
  };
}

export type LookupTarget = {
  /** The normalized 8-digit phone, when it parsed to a valid Kuwaiti mobile; otherwise omit it. */
  phone?: string | null;
  /** The validated MS-… order number; otherwise omit it. */
  orderId?: string | null;
  /** The derived client IP key (never empty — the caller normalizes to "unknown" as a fallback). */
  ip: string;
};

export type LookupLimiter = {
  recordAndCheckLookup: (target: LookupTarget) => boolean;
  /** TEST-ONLY introspection: the raw axis maps, so tests can assert sizes / key presence. */
  store: Store;
};

function createLimiter(store: Store, cfg: LimiterConfig): LookupLimiter {
  const axes = (): Axis[] => [store.phone, store.id, store.ip, store.phoneDay, store.idDay];
  let lastGlobalPrune = 0;

  /** Count the timestamps still inside the axis window. */
  function liveCount(times: number[], now: number, windowMs: number): number {
    let n = 0;
    for (const t of times) if (now - t < windowMs) n++;
    return n;
  }

  /** Drop keys from one axis whose newest timestamp has fallen outside that axis's window. */
  function pruneAxis(axis: Axis, now: number): void {
    for (const [key, times] of axis.map) {
      if (!times.some((t) => now - t < axis.windowMs)) axis.map.delete(key);
    }
  }

  function pruneOccasionally(now: number): void {
    if (now - lastGlobalPrune < cfg.windowMs) return;
    lastGlobalPrune = now;
    for (const axis of axes()) pruneAxis(axis, now);
  }

  /**
   * Make room in an axis at capacity. Two modes (see the HYBRID note at the top of the file):
   *
   * "dead" (TARGET axes) — evict ONLY DEAD keys (live count 0; exactly what pruneAxis would drop). A key
   * with ANY live hit is NEVER evicted: evicting a live key resets its throttle counter, and a key
   * climbing toward its limit is a sweep victim — resetting it re-opens the per-target enumeration bypass.
   * Full of live keys → nothing safe to reclaim → the new key FAILS CLOSED. Hard-bounded: at most one O(n)
   * scan per pruneCooldownMs, gated on TIME SINCE THE LAST SCAN alone — NOT "rescan whenever the last scan
   * freed something", which a trickle of one-key-per-insert expiries would defeat into a per-insert O(n)
   * scan (a CPU DoS). Within the cooldown a new key fails closed.
   *
   * "careful" (IP axis) — evict the lowest-live-count, oldest-first key, but NEVER one AT/OVER its limit
   * (an already-throttled IP is never reset). There is no per-target victim here, so resetting a climbing
   * ip key is harmless, and this keeps a count-1 flood from locking out fresh IPs. Rescan is allowed right
   * after a productive pass (freed > 0) so a sustained flood keeps admitting fresh IPs; it backs off for a
   * cooldown only once a pass frees nothing (every key at/over limit) — then the new key fails closed.
   */
  function makeRoom(axis: Axis, now: number): boolean {
    if (axis.evict === "dead") {
      if (now - axis.prune.at < cfg.pruneCooldownMs) return false;
      const victims: string[] = [];
      for (const [key, times] of axis.map) {
        if (liveCount(times, now, axis.windowMs) === 0) victims.push(key); // ONLY dead keys are evictable
      }
      for (const key of victims) axis.map.delete(key);
      axis.prune = { at: now, freed: victims.length }; // freed 0 ⇒ nothing reclaimable (fail closed)
      return victims.length > 0;
    }

    // "careful": skip the rescan only while the LAST pass freed nothing (everything at/over limit) and the
    // cooldown is unexpired — so a productive flood keeps admitting, but an all-protected axis backs off.
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
    for (const key of victims) axis.map.delete(key);
    axis.prune = { at: now, freed: victims.length }; // freed 0 ⇒ all protected (fail closed)
    return victims.length > 0;
  }

  /**
   * Record one attempt against `key` in `axis` and report whether it is now OVER the axis's limit within
   * its window. Returns false for an absent key (nothing to count on this axis). FAILS CLOSED when a new
   * key cannot be made room for. Only the newest `max + 1` timestamps are kept, so a hammered key cannot
   * grow without bound.
   */
  function hit(axis: Axis, key: string | null, now: number): boolean {
    if (!key) return false;
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
   * Records one lookup attempt and returns whether it is now throttled. The SINGLE combined
   * "record + decide" entry point, so the caller invokes it ONCE (recording and the decision cannot
   * disagree, and every attempt is counted exactly once). Keys are expected to be pre-validated by the
   * caller; empty keys are skipped on their axis. FAILS CLOSED on any internal error.
   */
  function recordAndCheckLookup(target: LookupTarget): boolean {
    try {
      const now = cfg.now();
      pruneOccasionally(now);
      const phone = target.phone?.trim() || null;
      const orderId = target.orderId?.trim() || null;
      const ip = target.ip?.trim() || "unknown";

      // IP-FIRST ADMISSION: record + check the IP axis before anything else. If this IP is already over
      // its cap, throttle WITHOUT touching the per-target axes — that bounds their growth to IP_MAX keys
      // per IP per window, so one IP can't slow-fill the 24h phone/id axes.
      if (hit(store.ip, ip, now)) return true;

      // Admitted (IP under cap): record + check EVERY target axis (array, no short-circuit) so each axis
      // counts this attempt even if another is already over, and a distributed attack on one victim
      // phone/id still trips those axes. Throttle if ANY is over.
      const over = [
        hit(store.phone, phone, now),
        hit(store.id, orderId, now),
        hit(store.phoneDay, phone, now),
        hit(store.idDay, orderId, now),
      ];
      return over.some(Boolean);
    } catch {
      return true; // fail closed — never let a limiter fault open the lookup surface
    }
  }

  return { recordAndCheckLookup, store };
}

// Prod singleton. Only the DATA (the Maps) lives on globalThis so it survives dev hot-reloads; the LOGIC
// (the closures) is rebuilt on every module load, so a hot-reload picks up new code instead of a stale
// closure frozen by `??=`.
const store: Store = ((globalThis as typeof globalThis & { __msLookupRateLimit?: Store }).__msLookupRateLimit ??=
  createStore(DEFAULTS));
const prod = createLimiter(store, DEFAULTS);

export const recordAndCheckLookup = prod.recordAndCheckLookup;

/** TEST-ONLY: build an ISOLATED limiter (its own store, injectable config) for unit tests. Never used in
 * production code — the prod path above exports only recordAndCheckLookup. */
export function __createLookupLimiterForTest(overrides: Partial<LimiterConfig> = {}): LookupLimiter {
  const cfg = { ...DEFAULTS, ...overrides };
  return createLimiter(createStore(cfg), cfg);
}
