// Admin product/home photo uploads. The picked file is POSTed to /api/admin/images/, where it is
// re-encoded with sharp and stored on the server (src/server/images/process.ts); the returned
// `u:<id>` key is what products and home slots reference. Nothing is kept in localStorage anymore —
// the server-rendered storefront can read these images (it could not read the old base64 blobs).

import { asset } from "@/lib/asset";
import type { UploadKind } from "@/lib/upload-key";

export type { UploadKind };

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB source limit (the server enforces the same)

/** A rejected upload, carrying an i18n key the editor turns into a toast (editor.photos.err.<key>). */
export class ImageError extends Error {
  readonly key: "notImage" | "tooLarge" | "decodeFailed";
  constructor(key: ImageError["key"]) {
    super(key);
    this.name = "ImageError";
    this.key = key;
  }
}

const ERROR_KEYS = new Set<ImageError["key"]>(["notImage", "tooLarge", "decodeFailed"]);

/** The server re-encode profile for a given slot. Caps live on the server, never in the request. */
function profileFor(kind: UploadKind, maxSide?: number): "packshot" | "photo" | "story" {
  if (kind === "packshot") return "packshot";
  // The full-bleed story photos ask for a larger longest side (STORY_UPLOAD in section-forms).
  if (maxSide && maxSide >= 1600) return "story";
  return "photo";
}

/**
 * Uploads a photo and returns its `u:<id>` key (what products and home slots reference). Throws
 * {@link ImageError} with an i18n key the caller toasts; a network/other failure throws a plain
 * Error (the caller shows a generic upload error). `opts.maxSide` only selects the server profile.
 */
export async function savePhotoUpload(
  file: File,
  kind: UploadKind,
  opts?: { maxSide?: number; maxChars?: number },
): Promise<string> {
  // Fast local checks (the server re-validates): reject non-images and oversize files before upload.
  if (!file.type.startsWith("image/")) throw new ImageError("notImage");
  if (file.size > MAX_BYTES) throw new ImageError("tooLarge");

  const body = new FormData();
  body.append("file", file);
  body.append("profile", profileFor(kind, opts?.maxSide));

  const res = await fetch(asset("/api/admin/images/"), { method: "POST", body });
  if (!res.ok) {
    const key = await res
      .json()
      .then((j: { error?: string }) => j?.error)
      .catch(() => undefined);
    if (key && ERROR_KEYS.has(key as ImageError["key"])) throw new ImageError(key as ImageError["key"]);
    throw new Error(`Upload failed (${res.status})`);
  }
  const { key } = (await res.json()) as { key: string };
  return key;
}
