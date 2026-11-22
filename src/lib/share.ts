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
function sign(payload: string, key?: string) {
  const secret = key || process.env.STUDIO_PASSWORD?.trim() || "studio-open";
  return createHmac("sha256", secret).update(`share:${payload}`).digest("base64url");
}

/** What a token names to follow the prototype's current version. */
export const LATEST = "latest";

/** `key` is the version it is stored under (v2.0), or `LATEST`. `secret` is the studio's password when this machine isn't the studio itself (the copy docs sign links here for the deployed one). */
export function mintShareToken(slug: string, key: string, secret?: string, dev?: boolean) {
  const payload = Buffer.from(`${slug}/${key}${dev ? "/dev" : ""}`).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** `dev` is a link for engineers: the same version, opened on the canvas in Dev, without the comments. */
export function readShareToken(token: string): { slug: string; key: string; dev: boolean } | null {
  const [payload, given] = token.split(".");
  if (!payload || !given) return null;
  const left = Buffer.from(given);
  const right = Buffer.from(sign(payload));
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const [slug, key, flag] = Buffer.from(payload, "base64url").toString().split("/");
  return slug && key ? { slug, key, dev: flag === "dev" } : null;
}

/** The token's prototype and the version it opens now: `latest` becomes the current version's key. */
export async function resolveShareToken(token: string): Promise<{ slug: string; key: string; dev: boolean } | null> {
  const named = readShareToken(token);
  if (!named || named.key !== LATEST) return named;
  const prototype = await getPrototype(named.slug);
  return prototype ? { slug: named.slug, key: prototype.current.key, dev: named.dev } : null;
}
