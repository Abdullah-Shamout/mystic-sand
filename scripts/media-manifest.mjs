// Maps the client's raw media (outside the repo) to semantic, lowercase web assets.
// Raw files stay in ../photos and ../videos; generated files are committed under public/.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const PHOTOS_DIR = path.resolve(WEB_DIR, "..", "photos");
export const VIDEOS_DIR = path.resolve(WEB_DIR, "..", "videos");

// "27(1)" -> "WhatsApp Image 2026-10-08 at 2.08.27 PM (1).jpeg"
export function photo(code) {
  const m = /^(\d\d)(?:\((\d)\))?$/.exec(code);
  if (!m) throw new Error(`Bad photo code: ${code}`);
  const suffix = m[2] ? ` (${m[2]})` : "";
  return path.join(PHOTOS_DIR, `WhatsApp Image 2026-10-08 at 2.08.${m[1]} PM${suffix}.jpeg`);
}

/**
 * kind:
 *  - "packshot": studio shot on light grey. Auto-cropped to a square around the
 *    product (product fills ~fillH of the height or ~fillW of the width), and
 *    brightened so the backdrop melts into the tile colour via mix-blend-multiply.
 *  - "render" / "photo": kept as-is (aspect preserved), just resized.
 */
export const images = [
  // ── The Trilogy (I, II, III) ─────────────────────────────────────────
  { name: "products/i/bottle", src: "27(1)", kind: "packshot" },
  { name: "products/ii/bottle", src: "28", kind: "packshot" },
  { name: "products/iii/bottle", src: "28(1)", kind: "packshot" },
  { name: "products/i/box", src: "20(2)", kind: "packshot" },
  { name: "products/ii/box", src: "20(3)", kind: "packshot" },
  { name: "products/iii/box", src: "21", kind: "packshot" },
  { name: "products/i/box-angle", src: "21(1)", kind: "packshot" },
  { name: "products/ii/box-angle", src: "21(2)", kind: "packshot" },
  { name: "products/iii/box-angle", src: "22", kind: "packshot" },
  { name: "products/i/with-box", src: "23(2)", kind: "packshot", fillW: 0.9 },
  { name: "products/ii/with-box", src: "23(3)", kind: "packshot", fillW: 0.9 },
  { name: "products/iii/with-box", src: "23(4)", kind: "packshot", fillW: 0.9 },
  { name: "renders/i", src: "38", kind: "render" },
  { name: "renders/ii", src: "37(1)", kind: "render" },
  { name: "renders/iii", src: "37", kind: "render" },

  // ── CAFÉ & OUD ───────────────────────────────────────────────────────
  { name: "products/cafe/bottle", src: "33", kind: "packshot" },
  { name: "products/oud/bottle", src: "34", kind: "packshot" },
  { name: "renders/cafe", src: "34(1)", kind: "render" },
  { name: "renders/oud", src: "35", kind: "render" },

  // ── Body ─────────────────────────────────────────────────────────────
  { name: "products/aura/can", src: "36(1)", kind: "packshot" },
  { name: "renders/aura", src: "35(1)", kind: "render" },

  // ── Home ─────────────────────────────────────────────────────────────
  { name: "products/oasis/bottle", src: "30", kind: "packshot" },
  { name: "products/mist/bottle", src: "29(1)", kind: "packshot" },
  { name: "products/dune/bottle", src: "30(1)", kind: "packshot" },
  { name: "products/home-trio", src: "29", kind: "packshot", fillW: 0.9 },
  { name: "products/home-trio-alt", src: "31", kind: "packshot", fillW: 0.9 },
  { name: "renders/oasis", src: "32(1)", kind: "render" },
  { name: "renders/mist", src: "31(1)", kind: "render" },
  { name: "renders/dune", src: "32", kind: "render" },
  { name: "products/oud-chips/chips", src: "36", kind: "packshot", fillW: 0.84 },

  // ── Trilogy Set ──────────────────────────────────────────────────────
  { name: "products/trilogy-set/bottles", src: "22(2)", kind: "packshot", fillW: 0.88 },
  { name: "products/trilogy-set/boxes", src: "20(1)", kind: "packshot", fillW: 0.88 },
  { name: "products/trilogy-set/boxes-tight", src: "20", kind: "packshot", fillW: 0.88 },

  // ── Lifestyle (real photography, dark & moody) ───────────────────────
  { name: "lifestyle/trio-basket", src: "25(1)", kind: "photo" },
  { name: "lifestyle/hourglass-candles", src: "26", kind: "photo" },
  { name: "lifestyle/candles-duo", src: "26(1)", kind: "photo" },
  { name: "lifestyle/roses-iii", src: "27", kind: "photo" },
];

export const LOGO_SOURCE = "25"; // black logo on Sand (the Instagram profile picture)

export const videos = [
  {
    name: "hero-desktop",
    src: "MS_VID2_V2.mp4",
    width: 1620,
    crf: 27,
    maxrate: "3000k",
    audio: false,
    poster: { at: 0.4 },
  },
  {
    name: "hero-mobile",
    src: "MS_VIDEO_2.mp4",
    width: 720,
    crf: 27,
    maxrate: "1800k",
    audio: false,
    poster: { at: 0.4 },
  },
  {
    name: "film",
    src: "MYSTIC_SAND.mp4",
    width: 720,
    crf: 25,
    maxrate: "2400k",
    audio: true,
    poster: { at: 26 },
  },
];
