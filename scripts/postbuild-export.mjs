// Post-build fix for the static export (runs after `next build`).
//
// Next 16.4 writes the per-segment prefetch payloads of route-grouped pages as
// nested folders, e.g.
//   out/en/orders/__next.$d$locale/!KHNob3Ap/orders/__PAGE__.txt
// while the client router requests the flat, dot-separated name:
//   /en/orders/__next.$d$locale.!KHNob3Ap.orders.__PAGE__.txt
// Static hosts (GitHub Pages) then answer 404 for every link prefetch. Copying each
// nested file to its flat name lets prefetching work and keeps the console clean.
import fs from "node:fs/promises";
import path from "node:path";
import { WEB_DIR } from "./media-manifest.mjs";

const OUT = path.join(WEB_DIR, "out");

async function filesUnder(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(full)));
    else result.push(full);
  }
  return result;
}

async function walk(dir, stats) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("__next.")) {
      for (const file of await filesUnder(full)) {
        const rel = path.relative(full, file).split(path.sep).join(".");
        const flat = path.join(dir, `${entry.name}.${rel}`);
        try {
          await fs.access(flat);
        } catch {
          await fs.copyFile(file, flat);
          stats.copied++;
        }
      }
    } else if (entry.name !== "_next") {
      await walk(full, stats);
    }
  }
}

const stats = { copied: 0 };
await walk(OUT, stats);
console.log(`postbuild-export: added ${stats.copied} flat prefetch files`);
