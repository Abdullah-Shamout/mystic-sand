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
