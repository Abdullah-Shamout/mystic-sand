import { createHash, timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { logger, redactError } from "@/server/log";
import { reconcileStalePending } from "@/server/orders/reconcile";

// POST /api/orders/reconcile/ — the in-process stale-pending reconciler, SECRET-GATED and FAIL-CLOSED
// like the payment webhook. The Phase 9 cron calls this; it runs ONLY at request time, never at build.
// (Node runtime — node:crypto is fine here; this route is NOT in the Edge/instrumentation graph.)
//
//   • No RECONCILE_SECRET configured → 404 (the endpoint is effectively disabled; don't advertise it).
//   • Wrong / missing x-reconcile-secret header → 401. The compare is constant-time AND length-blind
//     (both sides are hashed to equal-length digests first, so timing never leaks the secret length).
//   • Oversized body → 413 (the reconciler loops over real data; don't buffer an attacker-sized body).
//   • Cutoff: the JSON body's `olderThanMinutes` or RECONCILE_PENDING_AFTER_MIN (default 60). The route
//     clamps only the CEILING; reconcileStalePending owns the gateway-derived FLOOR (safe in every env).
//   • On a settle recovery (settled > 0) the storefront catalog cache is expired, as the webhook does.

const DEFAULT_AFTER_MIN = 60;
const CEIL_MIN = 60 * 24 * 90; // 90 days
const MAX_BODY_BYTES = 4 * 1024;

/** Constant-time, length-blind secret compare: hash both sides to fixed-length digests first. */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RECONCILE_SECRET?.trim();
  if (!secret) return new Response(null, { status: 404 }); // fail closed: feature disabled

  const provided = request.headers.get("x-reconcile-secret") ?? "";
  if (!secretMatches(provided, secret)) return new Response(null, { status: 401 });

  // Reject an oversized body before buffering it.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) return new Response(null, { status: 413 });

  // Resolve the cutoff: env default, overridden by a valid body value, then clamp the CEILING only.
  const envDefault = Number.parseInt(process.env.RECONCILE_PENDING_AFTER_MIN ?? "", 10);
  let minutes = Number.isFinite(envDefault) && envDefault > 0 ? envDefault : DEFAULT_AFTER_MIN;
  if (raw) {
    try {
      const body = JSON.parse(raw);
      if (body && typeof body === "object" && "olderThanMinutes" in body) {
        const n = Number((body as { olderThanMinutes: unknown }).olderThanMinutes);
        if (Number.isFinite(n)) minutes = n;
      }
    } catch {
      // invalid JSON → fall back to the env default
    }
  }
  minutes = Math.min(CEIL_MIN, Math.max(0, Math.floor(minutes)));

  try {
    const summary = await reconcileStalePending(minutes * 60 * 1000);
    if (summary.settled > 0) revalidateTag("catalog", { expire: 0 });
    return Response.json(summary);
  } catch (error) {
    logger.error({ event: "reconcile_route_failed", err: redactError(error) }, "reconcile route failed");
    return new Response(null, { status: 500 });
  }
}
