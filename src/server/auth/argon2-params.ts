import type { Algorithm, Options } from "@node-rs/argon2";

// argon2id cost parameters, shared by the password hasher (server/auth/password.ts), the seed
// script and the test helpers so every admin hash is produced with the same policy. Kept in a
// plain module (no "server-only") so `tsx` scripts and the Playwright suite can import it too.
//
// These match @node-rs/argon2's recommended defaults: argon2id, 19 MiB of memory and 2 passes —
// at or above the OWASP minimum. `Algorithm` is an ambient `const enum`, which isolatedModules
// forbids reading as a value, so the numeric literal (Argon2id = 2) is used with a type cast.
const ARGON2ID = 2 as Algorithm;

export const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB per thread
  timeCost: 2, // passes / iterations
  parallelism: 1,
  outputLen: 32,
};
