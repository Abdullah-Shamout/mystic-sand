// Admin-uploaded product photos. Each photo lives in its own localStorage key,
// `ms-img:<id>`, holding a small JSON record; products and order snapshots refer to it as
// `u:<id>` (a data: URL never goes into a product or an order). Safe on the server, where
// every read returns null and a write is a no-op.

export const UPLOAD_PREFIX = "u:";
const KEY_PREFIX = "ms-img:";

export type UploadKind = "packshot" | "photo";

export type Upload = {
  w: number;
  h: number;
  kind: UploadKind;
  /** A full data: URL, e.g. "data:image/webp;base64,…". */
  data: string;
};

/** Thrown by saveUpload when localStorage is full (quota exceeded). */
export class StorageFullError extends Error {
  constructor(message = "Storage is full") {
    super(message);
    this.name = "StorageFullError";
  }
}

export const isUploadKey = (key: string): boolean => key.startsWith(UPLOAD_PREFIX);

export const uploadIdFromKey = (key: string): string =>
  key.startsWith(UPLOAD_PREFIX) ? key.slice(UPLOAD_PREFIX.length) : key;

const storageKey = (id: string) => `${KEY_PREFIX}${id}`;

const cache = new Map<string, Upload | null>();

const isUpload = (value: unknown): value is Upload =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Upload).w === "number" &&
  typeof (value as Upload).h === "number" &&
  ((value as Upload).kind === "packshot" || (value as Upload).kind === "photo") &&
  typeof (value as Upload).data === "string";

/** Reads one upload (memoised by id). Returns null when missing, malformed or off the client. */
export function readUpload(id: string): Upload | null {
  if (cache.has(id)) return cache.get(id) ?? null;
  let value: Upload | null = null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isUpload(parsed)) value = parsed;
    }
  } catch {
    value = null;
  }
  cache.set(id, value);
  return value;
}

/** Writes one upload, throwing StorageFullError on quota. */
export function saveUpload(id: string, value: Upload): void {
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(value));
    cache.set(id, value);
  } catch (error) {
    cache.delete(id);
    throw new StorageFullError(error instanceof Error ? error.message : undefined);
  }
}

export function deleteUpload(id: string): void {
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
  cache.delete(id);
}

/** The ids of every stored upload (client only). */
export function listUploadIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) ids.push(key.slice(KEY_PREFIX.length));
    }
  } catch {
    // storage blocked
  }
  return ids;
}

/** Drops the in-memory cache (e.g. after a cross-tab storage event). */
export function clearUploadCache(): void {
  cache.clear();
}
