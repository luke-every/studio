import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { getPrototype } from "@/lib/registry";

/**
 * Share links: a prototype for somebody without the password. The token names
 * the prototype and either one version or `latest`, which always opens
 * whichever version is current. It is signed with
 * the studio password, so there is nothing to store and no new secret, and
 * changing the password ends every link at once. It opens a bare page for
 * looking at that version and nothing else in the studio.
 */
function sign(payload: string) {
  const secret = process.env.STUDIO_PASSWORD?.trim() || "studio-open";
  return createHmac("sha256", secret).update(`share:${payload}`).digest("base64url");
}

/** What a token names to follow the prototype's current version. */
export const LATEST = "latest";

/** `key` is the version it is stored under (v2.0), or `LATEST`. */
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

/** The token's prototype and the version it opens now: `latest` becomes the current version's key. */
export async function resolveShareToken(token: string): Promise<{ slug: string; key: string } | null> {
  const named = readShareToken(token);
  if (!named || named.key !== LATEST) return named;
  const prototype = await getPrototype(named.slug);
  return prototype ? { slug: named.slug, key: prototype.current.key } : null;
}
