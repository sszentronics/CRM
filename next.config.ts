import type { NextConfig } from "next";

// Tailwind is precompiled into app/globals.css (source: styles/tailwind-source.css).
// Hostinger's build server does not let Turbopack start the extra Node process that the
// @tailwindcss/turbopack loader needs, so no CSS loader rule is configured here.
// After changing Tailwind classes, run: pnpm css
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
