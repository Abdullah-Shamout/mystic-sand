import "server-only";

import { randomBytes } from "node:crypto";

import sharp from "sharp";

import { makeUploadId, UPLOAD_PREFIX, type UploadKind } from "@/lib/upload-key";
import { getDb, schema } from "@/server/db";
import { storage } from "@/server/storage";

// Server-side image ingestion. Mirrors the old client compressImage() caps but re-encodes with
// sharp (safe: no SVG/script payloads survive a raster re-encode) and writes to real storage.
//
// Profiles replace the client-supplied maxSide/maxChars numbers (never trust those):
//   packshot — product/home packshots: longest side 1000, flattened onto white, blended in the tile
//   photo    — product/home photos:    longest side 1000, own background
//   story    — full-bleed story photos: longest side 1600 (matches STORY_UPLOAD in section-forms)

export type ImageProfile = "packshot" | "photo" | "story";

const PROFILES: Record<ImageProfile, { maxSide: number; flatten: boolean; kind: UploadKind }> = {
  packshot: { maxSide: 1000, flatten: true, kind: "packshot" },
  photo: { maxSide: 1000, flatten: false, kind: "photo" },
  story: { maxSide: 1600, flatten: false, kind: "photo" },
};

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB source limit (matches the old client cap)
const WEBP_QUALITY = 80; // ≈ the old canvas WebP 0.8
const ACCEPTED = new Set(["jpeg", "png", "webp"]);

/** A rejected upload, carrying the same i18n key the client editor toasts (see src/lib/admin/image.ts). */
export class ImageProcessError extends Error {
  readonly key: "notImage" | "tooLarge" | "decodeFailed";
  readonly status: number;
  constructor(key: ImageProcessError["key"], status: number) {
    super(key);
    this.name = "ImageProcessError";
    this.key = key;
    this.status = status;
  }
}

export function isImageProfile(value: unknown): value is ImageProfile {
  return value === "packshot" || value === "photo" || value === "story";
}

/**
 * Re-encodes `input` per `profile`, writes it to storage and records it in the `images` table.
 * Returns the `u:<id>` key (what products/home/orders reference) and the public URL to render it.
 */
export async function storeUploadedImage(
  input: Buffer,
  profile: ImageProfile,
): Promise<{ key: string; url: string; id: string }> {
  if (input.byteLength > MAX_UPLOAD_BYTES) throw new ImageProcessError("tooLarge", 413);

  const { maxSide, flatten, kind } = PROFILES[profile];

  let data: Buffer;
  let width: number;
  let height: number;
  try {
    const img = sharp(input).rotate(); // honour EXIF orientation, like the old createImageBitmap
    const meta = await img.metadata();
    // Trust the decoded format, not the declared MIME.
    if (!meta.format || !ACCEPTED.has(meta.format)) throw new ImageProcessError("notImage", 415);

    img.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
    if (flatten) img.flatten({ background: "#ffffff" });
    const out = await img.webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    data = out.data;
    width = out.info.width;
    height = out.info.height;
  } catch (error) {
    if (error instanceof ImageProcessError) throw error;
    throw new ImageProcessError("decodeFailed", 422);
  }

  // Random (not content-addressed) id: each upload is independent, so deleting one in the library
  // never breaks another product that happened to upload the same bytes. The dims + kind are baked
  // into the id (see src/lib/upload-key.ts) so resolveImage stays pure. Immutable-cache-safe either
  // way — an id always maps to the same bytes.
  const token = randomBytes(12).toString("hex");
  const id = makeUploadId(token, width, height, kind);
  const mime = "image/webp";
  const storagePath = `${id}.webp`;

  await storage.put(storagePath, data, mime);
  await getDb()
    .insert(schema.images)
    .values({ id, kind, width, height, mime, bytes: data.byteLength, storagePath })
    .onConflictDoNothing();

  return { key: `${UPLOAD_PREFIX}${id}`, url: storage.publicUrl(id), id };
}
