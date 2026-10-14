import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Review links: what a QR code carries so a phone can leave comments.
 *
 * A prototype's own address is outside the studio's door, so anyone with it
 * can open it and nobody opening it that way can comment. A token in the
 * address changes that for one version only, for a day: it is a signature of
 * the prototype, the version and an expiry, made with the studio password (so
 * no new secret to set, and changing the password ends every link at once).
 * It can add comments to that version and do nothing else.
 */
const LIFETIME_SECONDS = 60 * 60 * 24;

function sign(slug: string, version: string, expires: number) {
  const secret = process.env.STUDIO_PASSWORD?.trim() || "studio-open";
  return createHmac("sha256", secret).update(`review:${slug}:${version}:${expires}`).digest("base64url");
}

/** A share link's comment token has no end: it lasts as long as the studio password does. */
const FOREVER = 4102444800; // 2100-01-01

/** `version` is the folder form, as in the address: v0-2. */
export function mintReviewToken(slug: string, version: string, { forever = false } = {}) {
  const expires = forever ? FOREVER : Math.floor(Date.now() / 1000) + LIFETIME_SECONDS;
  return `${expires}.${sign(slug, version, expires)}`;
}

export function checkReviewToken(token: string | null | undefined, slug: string, version: string) {
  const [expiry, given] = (token ?? "").split(".");
  const expires = Number(expiry);
  if (!given || !Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(sign(slug, version, expires));
  return left.length === right.length && timingSafeEqual(left, right);
}
