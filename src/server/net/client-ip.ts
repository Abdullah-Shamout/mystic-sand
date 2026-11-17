import "server-only";

import { isIP } from "node:net";

import { headers } from "next/headers";

/** The client IP for a rate-limit key. In production the reverse proxy sets a trusted header named
 * by TRUSTED_IP_HEADER (e.g. "cf-connecting-ip", or an x-real-ip the proxy OVERWRITES); trust ONLY
 * that. The inbound X-Forwarded-For is attacker-controlled — its leftmost hop is whatever the client
 * sent — so without a configured trusted header we fall back to the RIGHTMOST XFF hop (the one the
 * nearest proxy appended) purely to bucket attempts; that is not a security boundary (the robust
 * per-source limit is the Phase 9 reverse-proxy cap). The value is validated as an IP and length-
 * capped so a crafted header can't bloat the key or the in-memory store. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const trustedHeader = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
  const candidate = trustedHeader
    ? h.get(trustedHeader)
    : (h.get("x-forwarded-for")?.split(",").pop() ?? h.get("x-real-ip"));
  const ip = candidate?.trim() ?? "";
  return ip.length <= 45 && isIP(ip) !== 0 ? ip : "unknown";
}

/**
 * Expand an IPv6 address (already validated by isIP) to its 8 numeric hextets (0..0xffff each),
 * handling `::` compression and a trailing dotted-quad (`::ffff:1.2.3.4`). Returns null if it can't be
 * parsed cleanly. Purely defensive — a value that reached here passed isIP, but we re-validate rather
 * than trust the shape.
 */
function expandIpv6(addr: string): number[] | null {
  let head = addr;
  let tail: number[] = [];
  // A trailing IPv4 dotted-quad occupies the last two hextets (e.g. `::ffff:1.2.3.4`).
  const lastColon = addr.lastIndexOf(":");
  const afterColon = lastColon >= 0 ? addr.slice(lastColon + 1) : "";
  if (afterColon.includes(".")) {
    if (isIP(afterColon) !== 4) return null;
    const o = afterColon.split(".").map((n) => Number(n));
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    tail = [(o[0] << 8) | o[1], (o[2] << 8) | o[3]];
    head = addr.slice(0, lastColon); // the hextet portion, up to (not including) the quad's colon
  }

  const parts = head.split("::");
  if (parts.length > 2) return null; // more than one "::" is invalid
  const toHextets = (s: string): number[] => (s === "" ? [] : s.split(":").map((x) => parseInt(x, 16)));
  const left = toHextets(parts[0] ?? "");
  const right = parts.length === 2 ? toHextets(parts[1] ?? "") : [];

  let groups: number[];
  if (parts.length === 2) {
    const zeros = 8 - (left.length + right.length + tail.length);
    if (zeros < 0) return null;
    groups = [...left, ...Array<number>(zeros).fill(0), ...right, ...tail];
  } else {
    groups = [...left, ...tail];
  }
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) return null;
  return groups;
}

/**
 * Normalizes a client IP into a STABLE rate-limit key. Separate from clientIp() so callers can still
 * STORE the full address (e.g. the contact row) while bucketing attempts on the normalized key.
 *
 *   • IPv4                      → unchanged.
 *   • IPv4-mapped IPv6          → the embedded IPv4 (both `::ffff:1.2.3.4` and `::ffff:hhhh:hhhh`).
 *                                 Next back-fills a socket IPv4 into XFF as `::ffff:…`; collapsing it to
 *                                 the IPv4 (NOT a /64) keeps every IPv4 client in its own bucket, so one
 *                                 client can't be made to share the admin's bucket (or vice-versa).
 *   • Genuine IPv6              → its /64 network prefix (the smallest block a site is typically given),
 *                                 so address rotation inside one /64 can't dodge the limit.
 *   • "unknown" / invalid / ""  → "unknown".
 *
 * The input is attacker-controllable (XFF), so textual variants of the same address MUST collapse to one
 * key: we PARSE (never string-slice), strip any IPv6 zone id (`%…`, which isIP accepts) up front so it
 * can't spawn unbounded distinct keys, and emit a canonical lowercase prefix.
 */
export function ipRateLimitKey(ip: string): string {
  const trimmed = (ip ?? "").trim();
  if (!trimmed || trimmed === "unknown") return "unknown";
  // Drop an IPv6 zone id (`fe80::1%eth0`): isIP() accepts it, but it is not part of the routable address
  // and "addr%A"/"addr%B" would otherwise become distinct keys — an unbounded-key bypass.
  const addr = trimmed.split("%")[0];

  const kind = isIP(addr);
  if (kind === 4) return addr;
  if (kind !== 6) return "unknown";

  const groups = expandIpv6(addr);
  if (!groups) return "unknown";

  // IPv4-mapped: first five hextets 0, sixth 0xffff, IPv4 in the last two.
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  }
  // Genuine IPv6 → canonical lowercase /64 prefix (first four hextets).
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}
