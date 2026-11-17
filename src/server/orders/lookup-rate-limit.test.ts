import { describe, expect, it } from "vitest";

import { __createLookupLimiterForTest } from "./lookup-rate-limit";

// Unit coverage for the Phase-10 capacity-lockout DoS fix and IP-first admission. Playwright can't
// exercise a 100k-key flood, so these drive the injectable-config factory directly. A fixed clock keeps
// every timestamp in one window, so these assert capacity/admission behaviour, not window expiry.
const CLOCK = () => 1_000_000;

describe("lookup rate limiter — capacity eviction + IP-first admission", () => {
  it("(a) a capacity flood of the IP axis still ADMITS a fresh legit IP (no fail-closed lockout)", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 5, ipMax: 30, now: CLOCK });
    // Flood with distinct single-hit IPs (no phone/id) — each is count 1, well under ipMax.
    for (let i = 0; i < 200; i++) {
      expect(lim.recordAndCheckLookup({ ip: `ip-${i}` })).toBe(false);
    }
    // Careful eviction kept the axis bounded…
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(5);
    // …and a brand-new legit IP is still admitted. The OLD fail-closed-at-capacity bug threw `true` here.
    expect(lim.recordAndCheckLookup({ ip: "fresh-legit" })).toBe(false);
  });

  it("(b) a flood can NOT reset a throttled victim IP (its at/over-limit key survives eviction)", () => {
    const lim = __createLookupLimiterForTest({ maxKeys: 4, ipMax: 2, now: CLOCK });
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(false); // 1
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(false); // 2 == max, not over
    expect(lim.recordAndCheckLookup({ ip: "V" })).toBe(true); //  3 > max → throttled
    // Flood many fresh IPs — each triggers careful eviction, but V is at/over limit → protected.
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

  it("a key exactly AT the limit (count == max) survives a flood", () => {
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
    const lim = __createLookupLimiterForTest({ maxKeys: 3, ipMax: 1, now: CLOCK });
    // Drive three keys each OVER the limit (2 hits > ipMax 1) so they are all protected.
    for (const k of ["a", "b", "c"]) {
      lim.recordAndCheckLookup({ ip: k });
      lim.recordAndCheckLookup({ ip: k });
    }
    expect(lim.store.ip.map.size).toBe(3);
    // A new IP can't evict any protected key → it fails closed (throttled) and the cap holds.
    expect(lim.recordAndCheckLookup({ ip: "new" })).toBe(true);
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(3);
    expect(lim.store.ip.map.has("new")).toBe(false);
  });
});
