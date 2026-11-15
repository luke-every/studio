import "server-only";

import { checkReviewToken } from "@/lib/review";
import { resolveShareToken } from "@/lib/share";

/**
 * Whether a token lets somebody read one version's handoff without the password: a review token for that version (the
 * phone's QR code, and the studio's own canvas), or the share link's token that opened the page (it names the prototype,
 * and a version or the latest). `folder` is the version as in the address (v1-3); `key` is the version as stored (v1.3).
 */
export async function mayReadHandoff(token: string, slug: string, folder: string, key: string) {
  if (checkReviewToken(token, slug, folder)) return true;
  const named = await resolveShareToken(token).catch(() => null);
  return !!named && named.slug === slug && named.key === key;
}
