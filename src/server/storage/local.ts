import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";

import { asset } from "@/lib/asset";

import type { Storage } from "./index";

// Local-volume storage adapter: writes uploaded images under a directory on disk.
//
// The directory comes from UPLOADS_DIR (default ./uploads, which is gitignored). On a VPS this is a
// mounted Docker volume; in dev/tests it is a throwaway folder. Resolved lazily (never at import /
// build time) so a DB-free, UPLOADS_DIR-free production build never touches the filesystem.

function uploadsDir(): string {
  return process.env.UPLOADS_DIR?.trim() || join(process.cwd(), "uploads");
}

/** Resolves `storagePath` under the uploads dir, refusing anything that escapes it (path traversal). */
function resolve(storagePath: string): string {
  const clean = normalize(storagePath);
  if (isAbsolute(clean) || clean.startsWith("..") || clean.includes("\0")) {
    throw new Error(`Unsafe storage path: ${storagePath}`);
  }
  return join(uploadsDir(), clean);
}

export class LocalStorage implements Storage {
  async put(storagePath: string, bytes: Buffer): Promise<void> {
    const full = resolve(storagePath);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, bytes);
  }

  async get(storagePath: string): Promise<Buffer | null> {
    try {
      return await readFile(resolve(storagePath));
    } catch {
      return null;
    }
  }

  async delete(storagePath: string): Promise<void> {
    await rm(resolve(storagePath), { force: true });
  }

  publicUrl(id: string): string {
    // Trailing slash to match next.config `trailingSlash: true` (avoids a 308 on every <img>).
    return asset(`/api/images/${id}/`);
  }
}
