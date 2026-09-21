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
};

export default nextConfig;
