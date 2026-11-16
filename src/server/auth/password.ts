import "server-only";

import { hash, verify } from "@node-rs/argon2";

import { ARGON2_OPTIONS } from "./argon2-params";

// Password hashing for the admin account. argon2id with the shared cost params. The verifier never
// throws on a malformed/foreign hash (returns false) so a corrupt DB value can't 500 the login.

/** argon2id hash of `plain` (PHC string, embeds the salt + params). */
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/** True when `plain` matches `hashed`. False (never throws) on a malformed/empty hash. */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    // The cost params live inside the PHC string, so verify() needs no options to read them.
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

// A real argon2id hash, computed once, to verify against when the username is unknown. Running the
// same work on a miss keeps login timing (and so user existence) constant — the verify above always
// does a full hash, whether the user exists or not.
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword("mystic-sand-no-such-user-constant-timing-pad"));
}
