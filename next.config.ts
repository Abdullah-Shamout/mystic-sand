import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// GitHub Pages serves a project site from /<repo>/, so the deploy workflow sets
// NEXT_PUBLIC_BASE_PATH=/<repo>. Locally it is empty and the site runs at the root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
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
