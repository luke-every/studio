import "server-only";

/**
 * Everything the studio needs, all of it set in Vercel.
 *
 * Two things: a Blob store for content, and one shared password. There are
 * no accounts, no per-person credentials, and nothing to configure in the
 * app — Settings reports what is missing rather than asking for it.
 */

export function studioPassword(): string | null {
  return process.env.STUDIO_PASSWORD?.trim() || null;
}
