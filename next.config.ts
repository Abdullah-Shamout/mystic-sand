import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets
// NEXT_PUBLIC_BASE_PATH=/<repo>. Locally it is empty and the site runs at the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Identifies the build. Open pages compare it with /version.json and reload once when a
// newer version has been published (browsers may keep a page for up to 10 minutes).
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "local";
  }
}

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BUILD_ID: buildId() },
  // Tailwind v4 is wired through this Turbopack loader (there is no PostCSS config).
  // Building with --webpack would silently drop Tailwind.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default createNextIntlPlugin()(nextConfig);
