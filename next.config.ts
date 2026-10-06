import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The seed registry in `registry/` is read at runtime whenever the store
   * is empty or unconfigured, so its files have to be traced into the
   * deployed bundle. Without this the studio silently has no teams.
   */
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.json"],
    // The /push skill, handed out by /skill/push/<file>.
    "/skill/push/[file]": ["./.claude/skills/push/*"],
  },
};

export default nextConfig;
