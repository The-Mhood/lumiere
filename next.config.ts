import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produces a self-contained server (`.next/standalone/server.js`)
  // that the Electron desktop shell launches — no separate Node install needed.
  output: "standalone",
  // PGlite loads its WASM build relative to its own package files; bundling
  // it breaks that lookup. Keep it (and its Drizzle driver) external so
  // Node resolves them from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "drizzle-orm/pglite"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "archive.org" },
      { protocol: "https", hostname: "*.archive.org" },
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
};

export default nextConfig;
