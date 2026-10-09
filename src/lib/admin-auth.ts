"use client";

import { useSyncExternalStore } from "react";

/**
 * Admin sign-in for the demo back office. THIS IS NOT REAL SECURITY.
 *
 * Everything runs in the browser: there is no server, no cookie and no session that a
 * server could trust. Anyone who can read this bundle can read the default hash, and
 * anyone with the device can open the stored session. It only keeps the admin screens
 * out of the way of ordinary shoppers on a shared demo. The UI says so plainly.
 *
 * Credentials are never stored in the clear — only a SHA-256 hex digest of
 * `mystic-sand-admin:<username lowercased>:<password>`. The username is case-insensitive.
 */

// Default: username "admin", password "MysticSand2026".
// Recompute with:
//   node -e "const c=require('crypto');console.log(c.createHash('sha256').update('mystic-sand-admin:admin:MysticSand2026').digest('hex'))"
export const DEFAULT_ADMIN = {
  username: "admin",
  hash: "2f5f7bd65913a6a163260a843d332f584bca5c1c525c1569a79b0a78ac6d764f",
} as const;

const CREDS_KEY = "ms-admin-auth";
const SESSION_KEY = "ms-admin-session";
const SESSION_EVENT = "ms:admin-session";

const SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Hashing ──────────────────────────────────────────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Pure-JS SHA-256 of raw bytes. Used where crypto.subtle is missing (plain http). */
function sha256Bytes(bytes: Uint8Array): string {
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const len = bytes.length;
  const bitLen = len * 8;
  const total = (((len + 1 + 8 + 63) >> 6) << 6);
  const msg = new Uint8Array(total);
  msg.set(bytes);
  msg[len] = 0x80;
  const dv = new DataView(msg.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  const w = new Uint32Array(64);
  for (let i = 0; i < total; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let hex = "";
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, "0");
  return hex;
}

/** SHA-256 hex of a string: crypto.subtle when available, else the pure-JS fallback. */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = typeof globalThis.crypto !== "undefined" ? globalThis.crypto.subtle : undefined;
  if (subtle) {
    try {
      const digest = await subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      // Fall through to the pure-JS implementation.
    }
  }
  return sha256Bytes(bytes);
}

const credentialHash = (username: string, password: string) =>
  sha256Hex(`mystic-sand-admin:${username.toLowerCase()}:${password}`);

/** Constant-time-ish equality for two equal-length hex digests. */
function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Credentials ──────────────────────────────────────────────────────────────

type StoredCreds = { username: string; hash: string; updatedAt: number };

function readStoredCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredCreds>;
    if (v && typeof v.username === "string" && typeof v.hash === "string") {
      return { username: v.username, hash: v.hash, updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : 0 };
    }
  } catch {
    // ignore malformed or blocked storage
  }
  return null;
}

/** True when the username/password match the stored credentials (or the default). */
export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  const user = username.trim().toLowerCase();
  if (user.length === 0) return false;
  const expected = readStoredCreds() ?? DEFAULT_ADMIN;
  if (user !== expected.username.toLowerCase()) return false;
  const hash = await credentialHash(user, password);
  return hashesMatch(hash, expected.hash);
}

/** Overrides the default credentials for this browser. Used by store settings (later phase). */
export async function setAdminCredentials(username: string, password: string): Promise<void> {
  const user = username.trim();
  const hash = await credentialHash(user, password);
  const record: StoredCreds = { username: user, hash, updatedAt: Date.now() };
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(record));
  } catch {
    // storage blocked or full — nothing more we can do here
  }
}

// ── Session ──────────────────────────────────────────────────────────────────

type SessionRecord = { u: string; exp: number };

function notifySessionChange() {
  try {
    window.dispatchEvent(new Event(SESSION_EVENT));
  } catch {
    // no window or events blocked
  }
}

function parseSession(raw: string | null): SessionRecord | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SessionRecord>;
    if (v && typeof v.u === "string" && typeof v.exp === "number") return { u: v.u, exp: v.exp };
  } catch {
    // malformed
  }
  return null;
}

/**
 * Starts a session: 12 hours in sessionStorage by default, or 30 days in localStorage
 * when "Keep me signed in" is ticked. Always clears the other store so only one wins.
 */
export function startAdminSession(username: string, remember: boolean): void {
  const now = Date.now();
  const record: SessionRecord = { u: username, exp: now + (remember ? REMEMBER_MS : SESSION_MS) };
  try {
    if (remember) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(record));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(record));
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // storage blocked
  }
  notifySessionChange();
}

export function endAdminSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked
  }
  notifySessionChange();
}

/** Current session, or null. An expired record is cleared on read. */
export function readAdminSession(): SessionRecord | null {
  if (typeof window === "undefined") return null;
  let record: SessionRecord | null = null;
  let fromLocal = false;
  try {
    record = parseSession(sessionStorage.getItem(SESSION_KEY));
    if (!record) {
      record = parseSession(localStorage.getItem(SESSION_KEY));
      fromLocal = true;
    }
  } catch {
    return null;
  }
  if (!record) return null;
  if (record.exp <= Date.now()) {
    try {
      (fromLocal ? localStorage : sessionStorage).removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    return null;
  }
  return record;
}

function subscribeSession(onChange: () => void): () => void {
  window.addEventListener(SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Snapshot is a stable primitive (the username string, or null) so useSyncExternalStore
// never loops. Date.now() lives in this module function, not in a component's render.
const sessionSnapshot = (): string | null => readAdminSession()?.u ?? null;

/** Reactive signed-in username (or null). Updates on sign-in/out and cross-tab storage. */
export function useAdminSession(): string | null {
  return useSyncExternalStore(subscribeSession, sessionSnapshot, () => null);
}
