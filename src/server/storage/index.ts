import "server-only";

import { LocalStorage } from "./local";

// Object storage behind a narrow interface. Admin-uploaded images are re-encoded server-side
// (src/server/images/process.ts) and written here; the serving route streams them back out.
//
// Swapping to S3 / R2 later is ONE module: implement this interface and change the export below.
// The rest of the app only ever imports `storage` and the `Storage` type from here.

export interface Storage {
  /** Writes the bytes at `storagePath` (a repo-relative key), creating parents as needed. */
  put(storagePath: string, bytes: Buffer, contentType: string): Promise<void>;
  /** Reads the bytes at `storagePath`, or null when the object is missing. */
  get(storagePath: string): Promise<Buffer | null>;
  /** Removes the object at `storagePath` (a no-op when already gone). */
  delete(storagePath: string): Promise<void>;
  /** The public URL the storefront/admin uses to fetch an image by its `u:<id>` id. */
  publicUrl(id: string): string;
}

/** The active storage adapter. Replace with an S3/R2 adapter (same interface) to move off disk. */
export const storage: Storage = new LocalStorage();
