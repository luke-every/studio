import type { NextConfig } from "next";

/**
 * Which build this is, for Settings. Vercel supplies these while it builds; locally they are empty and Settings says
 * so. Nothing here is a secret: a commit, its first line, and the public address of the repository's history.
 */
const repo = process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : "";

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the same wifi use the local studio at <this-mac>.local. Without it Next blocks the
  // dev resources (hot reload and the rest) for any host but localhost.
  allowedDevOrigins: ["*.local"],
  // The Next.js dev tools badge, hidden everywhere in the local studio.
  devIndicators: false,
  env: {
    NEXT_PUBLIC_STUDIO_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_STUDIO_CHANGE: (process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").split("\n")[0],
    NEXT_PUBLIC_STUDIO_REPO: repo,
    NEXT_PUBLIC_STUDIO_BUILT: new Date().toISOString(),
  },
  /**
   * The seed registry in `registry/` is read at runtime whenever the store
   * is empty or unconfigured, so its files have to be traced into the
   * deployed bundle. Without this the studio silently has no teams.
   */
  outputFileTracingIncludes: {
    "/**": ["./registry/**/*.json"],
    // The /push skill, handed out by /skill/push/<file>.
    "/skill/push/[file]": ["./.claude/skills/push/*"],
    // The Remix script, handed out inside /remix/<slug>/<version>.
    "/remix/[slug]/[version]": ["./scripts/remix.mjs"],
  },
};

export default nextConfig;
