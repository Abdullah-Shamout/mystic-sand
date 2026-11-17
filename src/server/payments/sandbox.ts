import "server-only";

import type {
  InitiateInput,
  InitiateResult,
  PaymentGateway,
  PaymentResult,
  VerifyResult,
  WebhookResult,
} from "./types";

// A sandbox payment adapter. It mints a provider payment id, stashes a session in process memory, and
// sends the shopper to the hosted sandbox page (src/app/[locale]/sandbox/pay). That page records the
// chosen outcome back onto the session, which `verify` / `parseWebhook` then read.
//
// Deliberately process-local (one `next start`), like src/server/auth/rate-limit.ts: state lives on
// globalThis so it survives dev hot-reloads, and is size-capped + TTL'd so a flood of initiations
// can't grow it without bound. A durable store is a later phase — the sandbox never sees real money.
//
// Crypto is the Web Crypto global (randomUUID-style id + HMAC), NOT node:crypto: this module is in the
// import graph of instrumentation.ts, which Next also compiles for the Edge runtime (proxy.ts runs on
// Edge). node:crypto would break that Edge bundle; Web Crypto works in both runtimes.

const PROVIDER = "sandbox";
const SESSION_TTL_MS = 30 * 60 * 1000; // a session is valid for 30 minutes after it is created
const MAX_SESSIONS = 5_000; // hard ceiling on tracked sessions (bounds memory under an init flood)

export type SandboxSession = {
  orderId: string;
  amountFils: number;
  currency: "KWD";
  method: InitiateInput["method"];
  /** Absolute URL to return the shopper to once an outcome is chosen. */
  returnUrl: string;
  /** Set once, when the shopper presses Approve / Decline / Cancel. */
  outcome?: PaymentResult;
  createdAt: number;
};

const sessions: Map<string, SandboxSession> = ((
  globalThis as typeof globalThis & { __msSandboxSessions?: Map<string, SandboxSession> }
).__msSandboxSessions ??= new Map());

function isExpired(session: SandboxSession, now: number): boolean {
  return now - session.createdAt > SESSION_TTL_MS;
}

/** Drop expired sessions. Cheap; called on each initiate. */
function prune(now: number): void {
  for (const [ref, session] of sessions) {
    if (isExpired(session, now)) sessions.delete(ref);
  }
}

/** Evict oldest sessions (Map preserves insertion order) once over the ceiling. */
function evictIfOverCapacity(): void {
  if (sessions.size <= MAX_SESSIONS) return;
  let over = sessions.size - MAX_SESSIONS;
  for (const ref of sessions.keys()) {
    if (over <= 0) break;
    sessions.delete(ref);
    over--;
  }
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** `sbx_<32 hex chars>` — 16 bytes of CSPRNG. */
function mintPaymentId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `sbx_${toHex(bytes)}`;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(new Uint8Array(sig));
}

/** Constant-time compare of two equal-length hex strings (avoids a signature timing oracle). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readString(obj: unknown, key: string): string | undefined {
  if (obj && typeof obj === "object" && key in obj) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

/** The live session for `ref`, or `undefined` when it is unknown or expired (expired ones are swept). */
export function getSandboxSession(ref: string): SandboxSession | undefined {
  const session = sessions.get(ref);
  if (!session) return undefined;
  if (isExpired(session, Date.now())) {
    sessions.delete(ref);
    return undefined;
  }
  return session;
}

/**
 * Records the shopper's chosen outcome onto a session. SET-ONCE: a session that already has an
 * outcome is frozen, so Back + a different button can't flip a CAPTURED into a CANCELED. Returns
 * false when the session is unknown/expired or already decided.
 */
export function setSandboxOutcome(ref: string, outcome: PaymentResult): boolean {
  const session = getSandboxSession(ref);
  if (!session || session.outcome) return false;
  session.outcome = outcome;
  return true;
}

function verifyResultFor(providerPaymentId: string, session: SandboxSession): VerifyResult | null {
  if (!session.outcome) return null;
  return {
    providerPaymentId,
    result: session.outcome,
    amountFils: session.amountFils,
    currency: session.currency,
    raw: {
      provider: PROVIDER,
      orderId: session.orderId,
      method: session.method,
      outcome: session.outcome,
    },
  };
}

export const sandboxGateway: PaymentGateway = {
  provider: PROVIDER,

  async initiate(input: InitiateInput): Promise<InitiateResult> {
    const now = Date.now();
    prune(now);
    const providerPaymentId = mintPaymentId();
    sessions.set(providerPaymentId, {
      orderId: input.orderId,
      amountFils: input.amountFils,
      currency: input.currency,
      method: input.method,
      returnUrl: input.returnUrl,
      createdAt: now,
    });
    evictIfOverCapacity();

    const origin = input.origin.replace(/\/+$/, "");
    // trailingSlash: true in next.config.ts — keep the slash before the query.
    const redirectUrl = `${origin}/${input.locale}/sandbox/pay/?ref=${encodeURIComponent(providerPaymentId)}`;
    return { redirectUrl, providerPaymentId };
  },

  async verify(ref: { providerPaymentId: string }): Promise<VerifyResult | null> {
    const session = getSandboxSession(ref.providerPaymentId);
    if (!session) return null;
    return verifyResultFor(ref.providerPaymentId, session);
  },

  async parseWebhook(request: Request): Promise<WebhookResult> {
    const secret = process.env.SANDBOX_WEBHOOK_SECRET;
    // No secret → reject. An unsigned webhook is never trusted.
    if (!secret) return { ok: false, reason: "SANDBOX_WEBHOOK_SECRET is not configured" };

    const body = await request.text();
    const provided = request.headers.get("x-sandbox-signature") ?? "";
    const expected = await hmacHex(secret, body);
    if (!timingSafeEqualHex(provided, expected)) return { ok: false, reason: "invalid signature" };

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return { ok: false, reason: "invalid JSON body" };
    }

    const providerPaymentId = readString(payload, "providerPaymentId");
    if (!providerPaymentId) return { ok: false, reason: "missing providerPaymentId" };

    // The outcome of record comes from the stored session, never from the webhook body's claims.
    const session = getSandboxSession(providerPaymentId);
    if (!session) return { ok: false, reason: "unknown payment session" };
    const verify = verifyResultFor(providerPaymentId, session);
    if (!verify) return { ok: false, reason: "payment session has no outcome yet" };
    return { ok: true, verify };
  },
};
