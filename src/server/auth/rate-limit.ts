import "server-only";

// In-memory login rate limit + lockout, keyed by `${username}|${ip}`. Deliberately simple and
// process-local: it blunts online password guessing on a single server. A distributed/Redis store
// that survives restarts and spans instances is Phase 9.
//
// Failures are counted for unknown usernames too, so lockout can't be used to probe which users
// exist. State lives on globalThis so it survives dev hot-reloads (and this file only exports sync
// helpers, which a "use server" module may not).

const WINDOW_MS = 15 * 60 * 1000; // failures older than this don't count
const MAX_FAILURES = 5; // this many within the window locks the key
const LOCKOUT_MS = 15 * 60 * 1000; // how long the lock lasts

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

/** True when `key` is currently locked out. Checked BEFORE verifying the password. */
export function isLockedOut(key: string): boolean {
  const entry = store.get(key);
  return entry ? entry.lockedUntil > Date.now() : false;
}

/** Records a failed attempt for `key`, locking it once it crosses the threshold. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = store.get(key) ?? { failures: [], lockedUntil: 0 };
  entry.failures = entry.failures.filter((t) => now - t < WINDOW_MS);
  entry.failures.push(now);
  if (entry.failures.length >= MAX_FAILURES) entry.lockedUntil = now + LOCKOUT_MS;
  store.set(key, entry);
  pruneOccasionally(now);
}

/** Clears the counter for `key` after a successful login. */
export function clearFailures(key: string): void {
  store.delete(key);
}
