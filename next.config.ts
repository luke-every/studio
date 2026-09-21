import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The seed registry in `registry/` is read at runtime whenever the store
   * is empty or unconfigured, so its files have to be traced into the
   * deployed bundle. Without this the studio silently has no teams.
   */
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.json"],
  },
};

export default nextConfig;
