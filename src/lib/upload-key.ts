// Pure helpers for admin-upload media keys. An uploaded photo is referenced as `u:<id>`
// (products, home slots and order snapshots all use this shape). The `<id>` is self-describing:
//
//     <random-hex>_<width>x<height><kind>      kind = "p" (packshot) | "h" (photo)
//     e.g. 9af3…_1000x1333p
//
// Encoding the dimensions and kind in the id lets resolveImage() stay a PURE, SYNCHRONOUS function
// on both the server and the client (it never has to read the DB or localStorage to size an <img>
// or decide the packshot blend). The server mints the id on upload (src/server/images/process.ts).
//
// Safe everywhere: no React, no localStorage, no Node APIs.

export const UPLOAD_PREFIX = "u:";

/** The render treatment: "packshot" blends its light backdrop into the tile; "photo" keeps its own. */
export type UploadKind = "packshot" | "photo";

/** Dimensions + kind recovered from a `u:<id>` key, used to size the <img> and pick the blend. */
export type UploadMeta = { width: number; height: number; kind: UploadKind };

export const isUploadKey = (key: string): boolean => key.startsWith(UPLOAD_PREFIX);

export const uploadIdFromKey = (key: string): string =>
  key.startsWith(UPLOAD_PREFIX) ? key.slice(UPLOAD_PREFIX.length) : key;

const ID_META = /^[0-9a-f]+_(\d{1,5})x(\d{1,5})([ph])$/;

/** Parses the dimensions + kind out of an upload id, or null when the id is not self-describing. */
export function parseUploadId(id: string): UploadMeta | null {
  const m = ID_META.exec(id);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]), kind: m[3] === "p" ? "packshot" : "photo" };
}

/** Builds a self-describing id from a random token, the encoded dimensions and the kind flag. */
export function makeUploadId(token: string, width: number, height: number, kind: UploadKind): string {
  return `${token}_${width}x${height}${kind === "packshot" ? "p" : "h"}`;
}
