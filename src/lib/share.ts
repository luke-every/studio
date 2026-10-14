import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Share links: one version of one prototype, for somebody without the
 * password. The token names the prototype and the version and is signed with
 * the studio password, so there is nothing to store and no new secret, and
 * changing the password ends every link at once. It opens a bare page for
 * looking at that version and nothing else in the studio.
 */
function sign(payload: string) {
  const secret = process.env.STUDIO_PASSWORD?.trim() || "studio-open";
  return createHmac("sha256", secret).update(`share:${payload}`).digest("base64url");
}

/** `key` is the version it is stored under: v2.0. */
export function mintShareToken(slug: string, key: string) {
  const payload = Buffer.from(`${slug}/${key}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readShareToken(token: string): { slug: string; key: string } | null {
  const [payload, given] = token.split(".");
  if (!payload || !given) return null;
  const left = Buffer.from(given);
  const right = Buffer.from(sign(payload));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const [slug, key] = Buffer.from(payload, "base64url").toString().split("/");
  return slug && key ? { slug, key } : null;
}
