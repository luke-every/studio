import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The registry is read from disk at request time, so its files have to be
   * traced into the deployed bundle. Without this, reads succeed locally and
   * fail on Vercel.
   */
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.json"],
  },

  /**
   * Prototypes are plain files under public/p. Next serves exact paths only,
   * so /p/quiz-results/editorial would 404 without this — the rewrite is
   * what lets a prototype have a clean URL instead of one ending in
   * index.html.
   */
  async rewrites() {
    return [
      { source: "/p/:slug/:exploration", destination: "/p/:slug/:exploration/index.html" },
      { source: "/p/:slug", destination: "/p/:slug/index.html" },
    ];
  },
};

export default nextConfig;
