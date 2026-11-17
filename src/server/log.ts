import "server-only";

import pino from "pino";

// One process-wide structured logger (JSON to stdout). Deliberately transport-free: a bare pino
// instance writes synchronously to fd 1 with no worker thread, so it is safe in the Next server
// runtime and never pulled onto an Edge bundle (only server-only modules import it).
//
// Used for money/stock ALERTS that must never be swallowed — above all an oversold capture
// (settleOrder could not fulfil a payment it cannot un-charge) and a payment whose amount/binding
// does not match its order. Those are `logger.error(...)`: they page a human, not the shopper.

export const logger = pino({
  name: "mystic-sand",
  level: process.env.LOG_LEVEL?.trim() || "info",
});

/**
 * Safe error fields for structured logs. drizzle-orm wraps a failed query in an error whose `message`
 * and own-properties carry `Failed query: … params: <bound values>`, and node-postgres puts offending
 * row VALUES in `.detail` — so logging `String(error)` or the raw error object (pino would copy
 * `query`/`params`) LEAKS PII (names, addresses, emails, phones, tokens). This is an ALLOWLIST: it
 * emits ONLY the error name, the Postgres SQLSTATE `code`, and the `constraint` name — NEVER the
 * message, detail, params or query. Always log `err: redactError(error)`, never `err: String(error)`
 * and never the bare error object. Walks the `cause` chain to reach the underlying driver error.
 */
export function redactError(err: unknown): { name: string; code?: string; constraint?: string } {
  const out: { name: string; code?: string; constraint?: string } = { name: "Error" };
  const seen = new Set<unknown>();
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur && typeof cur === "object" && !seen.has(cur); depth++) {
    seen.add(cur);
    const e = cur as { name?: unknown; code?: unknown; constraint?: unknown; cause?: unknown };
    if (depth === 0 && typeof e.name === "string") out.name = e.name;
    if (out.code === undefined && typeof e.code === "string") out.code = e.code;
    if (out.constraint === undefined && typeof e.constraint === "string") out.constraint = e.constraint;
    cur = e.cause;
  }
  return out;
}
