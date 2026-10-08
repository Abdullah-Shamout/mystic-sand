// Generates responsive WebP files + src/data/media.generated.json from the raw photos.
// Usage: node scripts/prepare-images.mjs [nameFilter]
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { images, photo, WEB_DIR } from "./media-manifest.mjs";

const OUT_DIR = path.join(WEB_DIR, "public", "images");
const DATA_FILE = path.join(WEB_DIR, "src", "data", "media.generated.json");
const PACKSHOT_WIDTHS = [480, 960, 1600];
const PHOTO_WIDTHS = [640, 1024, 1600];

/** Bounding box of everything that differs clearly from the studio backdrop. */
async function findProduct(file) {
  const meta = await sharp(file).metadata();
  const { data, info } = await sharp(file)
    .resize(400, 400, { fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const samples = [];
  for (const [cx, cy] of [
    [3, 3],
    [width - 13, 3],
    [3, height - 13],
    [width - 13, height - 13],
  ]) {
    for (let y = cy; y < cy + 10; y++) for (let x = cx; x < cx + 10; x++) samples.push(at(x, y));
  }
  const bg = [0, 1, 2].map((c) => samples.reduce((s, p) => s + p[c], 0) / samples.length);

  const THRESHOLD = 38;
  const rows = new Array(height).fill(0);
  const cols = new Array(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = at(x, y);
      const d = Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2]));
      if (d > THRESHOLD) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (arr) => arr.findIndex((n) => n >= 2);
  const last = (arr) => arr.length - 1 - [...arr].reverse().findIndex((n) => n >= 2);
  const scale = meta.width / width;
  const x0 = first(cols);
  const x1 = last(cols);
  const y0 = first(rows);
  const y1 = last(rows);
  if (x0 < 0 || y0 < 0) throw new Error(`No product found in ${file}`);
  return {
    box: { x: x0 * scale, y: y0 * scale, w: (x1 - x0 + 1) * scale, h: (y1 - y0 + 1) * scale },
    bg,
    imgW: meta.width,
    imgH: meta.height,
  };
}

async function packshotBuffer(entry, file) {
  const { box, bg, imgW, imgH } = await findProduct(file);
  const fillH = entry.fillH ?? 0.72;
  const fillW = entry.fillW ?? 0.84;
  const side = Math.round(Math.max(box.h / fillH, box.w / fillW));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);

  // Pad with the backdrop colour when the square crop runs past the frame.
  const pad = {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, left + side - imgW),
    bottom: Math.max(0, top + side - imgH),
  };
  const background = { r: Math.round(bg[0]), g: Math.round(bg[1]), b: Math.round(bg[2]) };
  const padded = await sharp(file).extend({ ...pad, background }).toBuffer();
  const cropped = await sharp(padded)
    .extract({ left: left + pad.left, top: top + pad.top, width: side, height: side })
    .toBuffer();

  // Lift the backdrop to ~white so mix-blend-multiply dissolves it into the tile colour.
  const lum = (bg[0] + bg[1] + bg[2]) / 3;
  const gain = Math.min(1.12, 252 / lum);
  return { buffer: await sharp(cropped).linear(gain, 0).toBuffer(), w: side, h: side };
}

async function main() {
  const filter = process.argv[2];
  const manifest = {};
  try {
    Object.assign(manifest, JSON.parse(await fs.readFile(DATA_FILE, "utf8")));
  } catch {
    // first run
  }

  for (const entry of images) {
    if (filter && !entry.name.includes(filter)) continue;
    const file = photo(entry.src);
    let buffer;
    let w;
    let h;
    if (entry.kind === "packshot") {
      ({ buffer, w, h } = await packshotBuffer(entry, file));
    } else {
      buffer = await fs.readFile(file);
      const meta = await sharp(buffer).metadata();
      w = meta.width;
      h = meta.height;
    }

    const targetWidths = (entry.kind === "packshot" ? PACKSHOT_WIDTHS : PHOTO_WIDTHS)
      .map((tw) => Math.min(tw, w))
      .filter((tw, i, arr) => arr.indexOf(tw) === i);

    const outBase = path.join(OUT_DIR, entry.name);
    await fs.mkdir(path.dirname(outBase), { recursive: true });
    for (const tw of targetWidths) {
      await sharp(buffer)
        .resize({ width: tw, withoutEnlargement: true, kernel: "lanczos3" })
        .sharpen({ sigma: 0.5 })
        .webp({ quality: entry.kind === "packshot" ? 84 : 80, effort: 5 })
        .toFile(`${outBase}-${tw}.webp`);
    }

    manifest[entry.name] = {
      w,
      h,
      widths: targetWidths,
      kind: entry.kind,
    };
    console.log(`✓ ${entry.name.padEnd(36)} ${w}×${h}  [${targetWidths.join(", ")}]`);
  }

  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(WEB_DIR, DATA_FILE)} (${Object.keys(sorted).length} images)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
