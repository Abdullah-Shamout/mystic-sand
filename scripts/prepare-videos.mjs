// Compresses the brand videos for the web and extracts poster frames.
// Usage: node scripts/prepare-videos.mjs [nameFilter]
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import sharp from "sharp";
import { videos, VIDEOS_DIR, WEB_DIR } from "./media-manifest.mjs";

const OUT_DIR = path.join(WEB_DIR, "public", "videos");

// spawn + argument array: the client's filenames contain spaces and brackets.
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`))));
  });
}

async function main() {
  const filter = process.argv[2];
  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const v of videos) {
    if (filter && !v.name.includes(filter)) continue;
    const input = path.join(VIDEOS_DIR, v.src);
    const output = path.join(OUT_DIR, `${v.name}.mp4`);
    const bufsize = `${parseInt(v.maxrate, 10) * 2}k`;

    await run([
      "-i", input,
      "-vf", `scale=${v.width}:-2:flags=lanczos,format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "slow",
      "-crf", String(v.crf),
      "-maxrate", v.maxrate,
      "-bufsize", bufsize,
      "-profile:v", "high",
      "-level", "4.1",
      ...(v.audio ? ["-c:a", "aac", "-b:a", "128k", "-ac", "2"] : ["-an"]),
      "-movflags", "+faststart",
      output,
    ]);

    // Poster: grab a frame, then encode it as WebP with sharp.
    const tmp = path.join(os.tmpdir(), `ms-poster-${v.name}.png`);
    await run(["-ss", String(v.poster.at), "-i", input, "-frames:v", "1", "-vf", `scale=${v.width}:-2`, tmp]);
    await sharp(tmp).webp({ quality: 78 }).toFile(path.join(OUT_DIR, `${v.name}-poster.webp`));
    await fs.rm(tmp, { force: true });

    const { size } = await fs.stat(output);
    console.log(`✓ ${v.name.padEnd(14)} ${(size / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
