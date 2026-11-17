import { describe, expect, it } from "vitest";

import { __createContactLimiterForTest } from "./contact-rate-limit";

// Unit coverage for the Phase-10 capacity-lockout DoS fix on the single contact IP axis. A fixed clock
// keeps every timestamp in one window.
const CLOCK = () => 1_000_000;

describe("contact rate limiter — capacity eviction", () => {
  it("a capacity flood still ADMITS a fresh IP (no fail-closed lockout)", () => {
    const lim = __createContactLimiterForTest({ maxKeys: 5, ipMax: 5, now: CLOCK });
    for (let i = 0; i < 200; i++) expect(lim.recordAndCheckContact(`ip-${i}`)).toBe(false);
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(5);
    expect(lim.recordAndCheckContact("fresh")).toBe(false); // the old fail-closed bug threw `true` here
  });

  it("a flood can NOT reset a throttled victim IP", () => {
    const lim = __createContactLimiterForTest({ maxKeys: 4, ipMax: 2, now: CLOCK });
    lim.recordAndCheckContact("V"); // 1
    lim.recordAndCheckContact("V"); // 2 == max
    expect(lim.recordAndCheckContact("V")).toBe(true); // 3 > max → throttled
    for (let i = 0; i < 500; i++) lim.recordAndCheckContact(`flood-${i}`);
    expect(lim.store.ip.map.has("V")).toBe(true);
    expect(lim.recordAndCheckContact("V")).toBe(true); // counter intact → still throttled
  });

  it("preserves the per-IP threshold (5th allowed, 6th throttled) under the prod default", () => {
    const lim = __createContactLimiterForTest({ now: CLOCK }); // prod ipMax = 5
    for (let i = 0; i < 5; i++) expect(lim.recordAndCheckContact("one-ip")).toBe(false);
    expect(lim.recordAndCheckContact("one-ip")).toBe(true); // 6th over the limit
  });

  it("when every key is at/over limit, a new key fails closed and the cap is not exceeded", () => {
    const lim = __createContactLimiterForTest({ maxKeys: 3, ipMax: 1, now: CLOCK });
    for (const k of ["a", "b", "c"]) {
      lim.recordAndCheckContact(k);
      lim.recordAndCheckContact(k); // 2 hits > ipMax 1 → protected
    }
    expect(lim.store.ip.map.size).toBe(3);
    expect(lim.recordAndCheckContact("new")).toBe(true); // fails closed — nothing evictable
    expect(lim.store.ip.map.size).toBeLessThanOrEqual(3);
    expect(lim.store.ip.map.has("new")).toBe(false);
  });
});
