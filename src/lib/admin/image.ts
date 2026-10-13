// Client-side photo compression for admin product uploads. Everything stays on the device:
// the picked file is drawn to a canvas, scaled down and re-encoded as a small data: URL that
// lib/uploads.ts stores under its own key. Never runs on the server.

import { saveUpload, UPLOAD_PREFIX, type Upload, type UploadKind } from "@/lib/uploads";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB source limit
const DEFAULT_MAX_SIDE = 1000; // default longest side
const DEFAULT_MAX_CHARS = 200_000; // default target size of the stored data: URL

/** A rejected upload, carrying an i18n key the editor turns into a toast. */
export class ImageError extends Error {
  readonly key: "notImage" | "tooLarge" | "decodeFailed";
  constructor(key: ImageError["key"]) {
    super(key);
    this.name = "ImageError";
    this.key = key;
  }
}

let webpSupport: boolean | null = null;
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    webpSupport = false;
  }
  return webpSupport;
}

/** Draws the bitmap scaled so its longest side is at most `maxSide`, optionally on white. */
function draw(
  bitmap: ImageBitmap,
  maxSide: number,
  fillWhite: boolean,
): { canvas: HTMLCanvasElement; w: number; h: number } {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("decodeFailed");
  if (fillWhite) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, w, h };
}

/**
 * Compresses `file` into a small {@link Upload}. Rejects non-images and files over 15 MB.
 * Encodes WebP at 0.8 (JPEG 0.82 on a white background when the browser cannot make WebP),
 * stepping the quality (0.7, 0.6) and then the longest side down until the data: URL is around
 * `maxChars` characters or smaller. `kind` sets the render treatment ("packshot" blends its
 * light backdrop into the tile; "photo" keeps its own background). The defaults (1000px, ~200k)
 * suit product photos and most home slots; the full-bleed story photos pass a larger `maxSide`.
 */
export async function compressImage(
  file: File,
  kind: UploadKind,
  opts?: { maxSide?: number; maxChars?: number },
): Promise<Upload> {
  if (!file.type.startsWith("image/")) throw new ImageError("notImage");
  if (file.size > MAX_BYTES) throw new ImageError("tooLarge");

  const maxSide = opts?.maxSide ?? DEFAULT_MAX_SIDE;
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const smaller = Math.max(1, Math.round(maxSide * 0.8));

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("decodeFailed");
  }

  try {
    const webp = supportsWebp();
    const type = webp ? "image/webp" : "image/jpeg";
    // A packshot (or any JPEG, which has no alpha) is flattened onto white.
    const fillWhite = !webp || kind === "packshot";
    const top = webp ? 0.8 : 0.82;
    const steps: Array<{ maxSide: number; quality: number }> = [
      { maxSide, quality: top },
      { maxSide, quality: 0.7 },
      { maxSide, quality: 0.6 },
      { maxSide: smaller, quality: 0.6 },
    ];

    let best: Upload | null = null;
    for (const step of steps) {
      const { canvas, w, h } = draw(bitmap, step.maxSide, fillWhite);
      const data = canvas.toDataURL(type, step.quality);
      best = { w, h, kind, data };
      if (data.length <= maxChars) break;
    }
    if (!best) throw new ImageError("decodeFailed");
    return best;
  } finally {
    bitmap.close?.();
  }
}

/**
 * Compresses and stores a photo upload, returning its `u:<id>` key (what products and home
 * slots reference). Throws the same typed errors as {@link compressImage} / saveUpload, so the
 * caller can toast them. Story panel photos pass a larger `maxSide`/`maxChars` for the full bleed.
 */
export async function savePhotoUpload(
  file: File,
  kind: UploadKind,
  opts?: { maxSide?: number; maxChars?: number },
): Promise<string> {
  const upload = await compressImage(file, kind, opts);
  const id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, "");
  saveUpload(id, upload);
  return `${UPLOAD_PREFIX}${id}`;
}
