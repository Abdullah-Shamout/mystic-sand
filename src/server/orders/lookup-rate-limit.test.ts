import { describe, expect, it } from "vitest";

import { __createLookupLimiterForTest } from "./lookup-rate-limit";

// Unit coverage for the Phase-10 capacity-lockout DoS fix, IP-first admission, and the HYBRID eviction:
// the IP axis uses CAREFUL (lowest-live-count) eviction so a count-1 flood can't lock out fresh IPs, while
// the TARGET axes (phone/id/day) use DEAD-ONLY eviction so a climbing victim is never reset (the per-target
// sweep bypass). Playwright can't exercise a 100k-key flood, so these drive the injectable-config factory
// directly. A fixed clock keeps every timestamp in one window unless a test advances it.
const CLOCK = () => 1_000_000;

describe("lookup rate limiter — capacity eviction + IP-first admission", () => {
  it("(a) a count-1 flood of the IP axis still ADMITS a fresh legit IP (careful eviction, no fail-closed lockout)", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 5, ipMax: 30, now: CLOCK });
    // Flood with distinct single-hit IPs (no phone/id) — each count 1, well under ipMax. Careful eviction
    // evicts the lowest-live-count (here a count-1) key to make room, so a fresh IP is never locked out.
    for (let i = 0; i < 200; i++) expect(lim.recordAndCheckLookup({ ip: `ip-${i}` })).toBe(false);
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(5); // careful eviction kept the axis bounded…
    expect(lim.recordAndCheckLookup({ ip: "fresh-legit" })).toBe(false); // …and admits a fresh IP
  });

  it("(a2) a TARGET axis (phone) full of LIVE keys fails closed — dead-only never resets a live key", () => {
    // One IP under a huge ipMax so IP-first admission always admits and the phone axis is what fills up.
    const lim = __createLookupLimiterForTest({ phoneMax: 10, maxKeys: 4, ipMax: 10_000, pruneCooldownMs: 0, now: CLOCK });
    const ip = "under-cap";
    for (let i = 0; i < 4; i++) expect(lim.recordAndCheckLookup({ ip, phone: `p${i}` })).toBe(false); // count 1, live
    expect(lim.store.phone.map.size).toBe(4);
    // Dead-only eviction can't evict any LIVE key to buy room, so a fresh phone fails closed and is not
    // recorded — the per-target fail-closed property (the tracked distributed-flood residual).
    expect(lim.recordAndCheckLookup({ ip, phone: "fresh" })).toBe(true);
    expect(lim.store.phone.map.has("fresh")).toBe(false);
  });

  it("(b) a flood can NOT reset a throttled victim IP (its at/over-limit key is protected from careful eviction)", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 4, ipMax: 2, now: CLOCK });
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(false); // 1
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(false); // 2 == max, not over
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(true); //  3 > max → throttled
    // Flood many fresh IPs — careful eviction evicts the lowest-live-count key, but V is at/over limit → protected.
    for (let i = 0; i < 500; i++) lim.recordAndCheckLookup({ ip: `flood-${i}` });
    expect(lim.store.ip.map.has("V")).toBe(true); // never evicted…
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(true); // …and still throttled (counter intact)
  });

  it("(c) IP-first admission: an over-cap IP does NOT create new per-target axis keys", () => {
    const lim = __createLookupLimiterForTest({ ipMax: 2, maxKeys: 100_000, now: CLOCK });
    const ip = "attacker";
    lim.recordAndCheckLookup({ ip, phone: "P1" }); // ip 1 → admitted, P1 recorded
    lim.recordAndCheckLookup({ ip, phone: "P2" }); // ip 2 → admitted, P2 recorded
    expect(lim.store.phone.map.size).toBe(2);
    expect(lim.store.phoneDay.map.size).toBe(2);

    // The IP is now over its cap: this attempt is throttled WITHOUT recording the fresh phone P3.
    expect(lim.recordAndCheckLookup({ ip, phone: "P3" })).toBe(true);
    expect(lim.store.phone.map.has("P3")).toBe(false);
    expect(lim.store.phoneDay.map.has("P3")).toBe(false);
    expect(lim.store.phoneDay.map.size).toBe(2); // unchanged — a single IP can't slow-fill the day axes
  });

  it("an IP key exactly AT the limit (count == max) survives a flood (careful eviction protects at/over-limit)", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 4, ipMax: 3, now: CLOCK });
    lim.recordAndCheckLookup({ ip: "V" }); // 1
    lim.recordAndCheckLookup({ ip: "V" }); // 2
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(false); // 3 == max → at limit, not over
    for (let i = 0; i < 300; i++) lim.recordAndCheckLookup({ ip: `flood-${i}` });
    expect(lim.store.ip.map.has("V")).toBe(true); // "at or over its limit" is protected, not just "over"
  });

  it("a DISTRIBUTED attack on one victim phone still throttles on the phone axis", () => {
    const lim = __createLookupLimiterForTest({ phoneMax: 10, ipMax: 100, maxKeys: 100_000, now: CLOCK });
    const victim = "99887766";
    let throttled = false;
    // Each attacker IP stays well under its own cap, but all hammer the one victim phone.
    for (let i = 0; i < 20; i++) throttled = lim.recordAndCheckLookup({ ip: `ip-${i}`, phone: victim });
    expect(throttled).toBe(true); // the per-phone axis tripped (> phoneMax), victim protection intact
  });

  it("when every tracked IP key is at/over limit, a new IP fails closed and the cap is not exceeded", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 3, ipMax: 1, pruneCooldownMs: 0, now: CLOCK });
    // Drive three keys each OVER the limit (2 hits > ipMax 1) so they are all protected from eviction.
    for (const k of ["a", "b", "c"]) {
      lim.recordAndCheckLookup({ ip: k });
      lim.recordAndCheckLookup({ ip: k });
    }
    expect(lim.store.ip.map.size).toBe(3);
    // Careful eviction can't evict any protected key → the new IP fails closed (throttled) and the cap holds.
    expect(lim.recordAndCheckLookup({ ip: "new" })).toBe(true);
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(3);
    expect(lim.store.ip.map.has("new")).toBe(false);
  });

  it("ping-pong: a capacity flood can NOT reset a CLIMBING victim-phone counter (sweep-bypass regression)", () => {
    // One attacker IP under a huge ipMax so IP-first admission always admits (models rotating IPs without
    // also filling the IP axis, which shares maxKeys). No orderId, so only the phone axes are exercised.
    // phoneMax 5 gives the victim a real climbing window (counts 1..5) BELOW the limit, during which the
    // old lowest-live-count eviction would have evicted + reset it; the fillers are pinned AT phoneMax so
    // they out-rank the victim the whole way and the victim stays the sole global minimum.
    const lim = __createLookupLimiterForTest({ phoneMax: 5, maxKeys: 4, ipMax: 10_000, now: CLOCK });
    const ip = "under-cap";
    const victim = "55667788";

    lim.recordAndCheckLookup({ ip, phone: victim }); // victim → count 1 (the global minimum)
    for (const f of ["f0", "f1", "f2"]) {
      for (let h = 0; h < 5; h++) lim.recordAndCheckLookup({ ip, phone: f }); // count 5 (== phoneMax)
    }
    expect(lim.store.phone.map.size).toBe(4); // at capacity (maxKeys)

    // ALTERNATE a victim probe (victim is below the limit and the global minimum) with a FRESH filler
    // insert, which at capacity tries to evict. Under the OLD rule the climbing victim was the eviction
    // target → reset to absent; under dead-only eviction the live victim is never touched, so its counter
    // climbs to the throttle and HOLDS.
    let reached = false;
    for (let i = 0; i < 8; i++) {
      const over = lim.recordAndCheckLookup({ ip, phone: victim }); // climb the victim
      lim.recordAndCheckLookup({ ip, phone: `fresh-${i}` }); // fresh filler → makeRoom at capacity
      if (over) reached = true;
      // The victim key is NEVER evicted, and its stored live count never collapses back to 1 (a reset).
      expect(lim.store.phone.map.has(victim)).toBe(true);
      expect(lim.store.phone.map.get(victim)!.length).toBeGreaterThan(1);
      // Once throttled it STAYS throttled across the interleaved inserts (never reset below its live count).
      if (reached) expect(lim.recordAndCheckLookup({ ip, phone: victim })).toBe(true);
    }
    expect(reached).toBe(true); // the per-phone throttle was actually reached (not bypassed forever)
  });

  it("makeRoom reclaims a DEAD key (not a live one) on a TARGET axis, between global prune passes", () => {
    let t = 0;
    const windowMs = 1000;
    // dayMs == windowMs so the phoneDay axis ages in lockstep with phone (otherwise its 24h window keeps the
    // keys live and it fails closed, masking the phone-axis result). pruneCooldownMs 0 so the dead-only scan
    // is never gated; one IP under a huge ipMax so IP-first admission always admits.
    const lim = __createLookupLimiterForTest({
      phoneMax: 30, maxKeys: 2, windowMs, dayMs: windowMs, ipMax: 10_000, pruneCooldownMs: 0, now: () => t,
    });
    const ip = "under-cap";
    // t=100: insert "aging" (no global prune yet — lastGlobalPrune stays 0 while now < windowMs).
    t = 100;
    expect(lim.recordAndCheckLookup({ ip, phone: "aging" })).toBe(false);
    // t=1000: a global prune fires (now - lastGlobalPrune >= windowMs). "aging" (newest 100) is still live
    // here (1000-100 = 900 < 1000) so it survives; inserting "keep" fills the phone axis to capacity.
    t = 1000;
    expect(lim.recordAndCheckLookup({ ip, phone: "keep" })).toBe(false);
    expect(lim.store.phone.map.size).toBe(2);
    // t=1100: "aging" is now DEAD (1100-100 = 1000, outside the window) but NO global prune runs this call
    // (now - lastGlobalPrune = 100 < windowMs). The fresh phone is at capacity → makeRoom runs and evicts
    // ONLY the dead "aging" key (never the live "keep"), admitting "fresh".
    t = 1100;
    expect(lim.recordAndCheckLookup({ ip, phone: "fresh" })).toBe(false);
    expect(lim.store.phone.map.has("aging")).toBe(false); // the dead key was reclaimed…
    expect(lim.store.phone.map.has("keep")).toBe(true); //   …the live key was NOT
    expect(lim.store.phone.map.has("fresh")).toBe(true);
  });
});
