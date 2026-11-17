import "server-only";

// In-memory login rate limit + lockout, keyed by `${username}|${ip}`. Deliberately simple and
// process-local: it blunts online password guessing on a single server. A distributed/Redis store
// that survives restarts and spans instances is Phase 9.
//
// Failures are counted for unknown usernames too, so lockout can't be used to probe which users
// exist. State lives on globalThis so it survives dev hot-reloads (and this file only exports sync
// helpers, which a "use server" module may not).
//
// Hardening (Phase 4 security review): the store is size-capped so a flood of distinct keys (rotated
// usernames / spoofed IPs) can't grow it without bound (memory DoS), and a small global gate caps the
// number of concurrent argon2 verifications so cheap unauthenticated requests can't amplify into CPU /
// thread-pool exhaustion. The authoritative per-source throttle is still the Phase 9 reverse-proxy
// request cap; these are in-code defense-in-depth.

const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count
const MAX_FAILURES = 5; // this many within the window locks the key
const LOCKOUT_MS = 15 * 60 * 1000; // how long the lock lasts
const MAX_KEYS = 10_000; // hard ceiling on tracked keys (bounds memory under a key-rotation flood)
const MAX_CONCURRENT_VERIFIES = 8; // max argon2 verifications in flight at once (bounds amplification)

type Entry = { failures: number[]; lockedUntil: number };

const store: Map<string, Entry> = ((
  globalThis as typeof globalThis & { __msAuthRateLimit?: Map<string, Entry> }
).__msAuthRateLimit ??= new Map());

let lastPrune = 0;
function pruneOccasionally(now: number): void {
  if (now - lastPrune < WINDOW_MS) return;
  lastPrune = now;
  for (const [key, entry] of store) {
    const live = entry.failures.some((t) => now - t < WINDOW_MS);
    if (!live && entry.lockedUntil <= now) store.delete(key);
  }
}

/** Evict oldest entries (Map preserves insertion order) once over the ceiling. Never evicts `keep` or a
 * currently-locked entry, so a flood of fresh keys can't push out — and thereby reset — an active
 * lockout. If everything is locked the cap is briefly exceeded rather than a live lock being dropped. */
function evictIfOverCapacity(keep: string): void {
  if (store.size <= MAX_KEYS) return;
  const over = store.size - MAX_KEYS;
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store) {
    if (removed >= over) break;
    if (key === keep || entry.lockedUntil > now) continue;
    store.delete(key);
    removed++;
  }
}

/** True when `key` is currently locked out. Checked BEFORE verifying the password. */
export function isLockedOut(key: string): boolean {
  const entry = store.get(key);
  return entry ? entry.lockedUntil > Date.now() : false;
}

/** Records an attempt for `key`, locking it once it crosses the threshold. Call this BEFORE the
 * awaited password verify (optimistic reservation) and `clearFailures` on success — otherwise a
 * burst of concurrent logins all pass `isLockedOut` before any failure is recorded (check-then-act
 * race) and the cap never bounds the in-flight attempts. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = store.get(key) ?? { failures: [], lockedUntil: 0 };
  entry.failures = entry.failures.filter((t) => now - t < WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
  store.set(key, entry);
  pruneOccasionally(now);
  evictIfOverCapacity(key);
}

/** Clears the counter for `key` after a successful login. */
export function clearFailures(key: string): void {
  store.delete(key);
}

// Global in-flight argon2 gate. A `login` acquires a slot before the (expensive) verify and releases
// it in a finally; when the cap is reached the attempt is rejected cheaply, before any hashing.
const gate: { inFlight: number } = ((
  globalThis as typeof globalThis & { __msVerifyGate?: { inFlight: number } }
).__msVerifyGate ??= { inFlight: 0 });

/** Reserves a password-verification slot, or false when the global concurrency cap is reached. */
export function tryAcquireVerifySlot(): boolean {
  if (gate.inFlight >= MAX_CONCURRENT_VERIFIES) return false;
  gate.inFlight++;
  return true;
}

/** Releases a slot taken by tryAcquireVerifySlot(). Always call in a finally. */
export function releaseVerifySlot(): void {
  if (gate.inFlight > 0) gate.inFlight--;
}
