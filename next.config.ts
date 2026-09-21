import type { NextConfig } from "next";

/**
 * Nothing to configure. Prototypes live in Blob and are served from its own
 * CDN, so there is no static content to trace into the bundle and no rewrite
 * to give a prototype a clean URL.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
