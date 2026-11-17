import { describe, expect, it, vi } from "vitest";

// `client-ip.ts` imports `next/headers` at module scope (only clientIp() calls it). Stub it so importing
// the module for the PURE ipRateLimitKey tests doesn't pull Next's request internals into plain Node.
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import { ipRateLimitKey } from "./client-ip";

// Unit coverage for the rate-limit IP key normalizer. The input is attacker-controllable (XFF), so the
// contract is: textual variants of the same address collapse to one key, and nothing is unbounded.
describe("ipRateLimitKey", () => {
  it("returns a plain IPv4 unchanged", () => {
    expect(ipRateLimitKey("203.0.113.5")).toBe("203.0.113.5");
    expect(ipRateLimitKey("127.0.0.1")).toBe("127.0.0.1");
  });

  it("maps an IPv4-mapped IPv6 to the embedded IPv4 (dotted, mixed-case and hex forms)", () => {
    expect(ipRateLimitKey("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(ipRateLimitKey("::FFFF:203.0.113.5")).toBe("203.0.113.5"); // case-insensitive hextets
    expect(ipRateLimitKey("::ffff:7f00:1")).toBe("127.0.0.1"); // hex form of 127.0.0.1
    expect(ipRateLimitKey("0:0:0:0:0:ffff:1.2.3.4")).toBe("1.2.3.4"); // fully uncompressed
    // Critically NOT /64-truncated: distinct IPv4 clients stay in distinct buckets.
    expect(ipRateLimitKey("::ffff:203.0.113.5")).not.toBe(ipRateLimitKey("::ffff:203.0.113.6"));
  });

  it("collapses a genuine IPv6 to its /64 prefix (rotation inside a /64 can't dodge the limit)", () => {
    const a = ipRateLimitKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    const b = ipRateLimitKey("2001:db8:1:2:1111:2222:3333:4444");
    expect(a).toBe(b); // same /64 → same key
    expect(a).toBe("2001:db8:1:2::/64");
    const c = ipRateLimitKey("2001:db8:1:3::1");
    expect(c).not.toBe(a); // different /64 → different key
  });

  it("normalizes textual variants of the same /64 to one key", () => {
    expect(ipRateLimitKey("2001:db8::1")).toBe(ipRateLimitKey("2001:0db8:0:0:0:0:0:2"));
    expect(ipRateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });

  it("ignores an IPv6 zone id so it can't spawn unbounded distinct keys", () => {
    expect(ipRateLimitKey("2001:db8:1:2::1%eth0")).toBe(ipRateLimitKey("2001:db8:1:2::1"));
    expect(ipRateLimitKey("fe80::1%eth0")).toBe(ipRateLimitKey("fe80::1%wlan0"));
  });

  it("maps unknown / empty / garbage to 'unknown'", () => {
    expect(ipRateLimitKey("unknown")).toBe("unknown");
    expect(ipRateLimitKey("")).toBe("unknown");
    expect(ipRateLimitKey("   ")).toBe("unknown");
    expect(ipRateLimitKey("not-an-ip")).toBe("unknown");
    expect(ipRateLimitKey("999.999.999.999")).toBe("unknown");
  });
});
