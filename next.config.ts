import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Keep trailing slashes on every URL: the e2e suite and the locale redirect assume them.
  trailingSlash: true,
  // TODO(phase later): enable next/image optimization. The storefront serves pre-generated
  // responsive images through asset(), so the optimizer stays off for now.
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
