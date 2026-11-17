import "server-only";

import { sql } from "drizzle-orm";

import { getDb, type Db } from "./index";

// Advisory locks for the SINGLETON read-modify-write actions (settings, home_overrides). Each of
// those actions reads the one row, merges a PATCH, and upserts it back. A plain `SELECT … FOR UPDATE`
// cannot lock a singleton row that does not exist yet (the first save INSERTs it), so two concurrent
// admins would both read the pre-existing value, merge their own field, and the later upsert would
// WIPE the other's change (a lost update). A transaction-scoped advisory lock serialises the whole
// read→merge→upsert instead: it is a cluster-wide mutex on an arbitrary key that does NOT depend on a
// row existing, and it auto-releases when the transaction ends (commit OR rollback), so a thrown save
// never strands the lock.
//
// Each singleton owns a DISTINCT constant key, so a settings save never blocks a home save. The keys
// are bigints: `pg_advisory_xact_lock(bigint)` is the single-argument overload, resolved unambiguously
// (the two-argument form takes two int4s).

// `BigInt(1)` rather than the `1n` literal: the tsconfig target is ES2017, which forbids BigInt
// literal syntax, but the esnext lib still provides the BigInt() global. Both produce a `bigint`.
/** Advisory-lock key for the `settings` singleton (src/server/actions/settings.ts). */
export const SETTINGS_LOCK = BigInt(1);
/** Advisory-lock key for the `home_overrides` singleton (src/server/actions/home.ts). */
export const HOME_LOCK = BigInt(2);

/** The Drizzle transaction handle (same query-builder surface as the Db). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a transaction that holds `pg_advisory_xact_lock(key)` for its whole duration. The
 * lock is acquired as the FIRST statement, so the read `fn` does on `tx` sees a state no other holder
 * of the same key can be mid-writing; it auto-releases at transaction end. Returns whatever `fn`
 * returns. The transaction runs at the default READ COMMITTED isolation on purpose: each statement
 * after the lock sees the latest committed data, so the read reflects a prior holder's committed write.
 */
export async function withAdvisoryLock<T>(key: bigint, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    // FIRST statement: block until this key is ours. Everything `fn` reads/writes is then serialised
    // against every other holder of the same key.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${key})`);
    return fn(tx);
  });
}
