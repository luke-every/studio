import type { NextRequest } from "next/server";

import { CONVENTIONS_REPO } from "@/lib/conventions";

/**
 * The team conventions — the starter app, the conventions, the /newprototype
 * skill and the licensed fonts — as one archive, for the installer.
 *
 * They live in a private repository, so the studio reads them with its own
 * token and hands them to anyone who knows the studio password. That is how a
 * new person gets them without being added to anything on GitHub. Because the
 * fonts are licensed, nothing is handed out unless a password is set.
 *
 * The token is `CONVENTIONS_GITHUB_TOKEN` if there is one, otherwise the same
 * `STUDIO_GITHUB_TOKEN` as everything else, as long as it can see the
 * repository.
 */
export async function GET(request: NextRequest) {
  const say = (message: string, status: number) =>
    new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

  const password = process.env.STUDIO_PASSWORD?.trim();
  if (!password) {
    return say("The studio has no password yet, and the fonts in this bundle are licensed, so it won't hand them out.", 403);
  }
  if (request.headers.get("x-studio-password")?.trim() !== password) {
    return say("Wrong or missing studio password.", 401);
  }

  const token = (process.env.CONVENTIONS_GITHUB_TOKEN ?? process.env.STUDIO_GITHUB_TOKEN)?.trim();
  if (!token) return say("The studio isn't connected to the conventions repository.", 503);

  // GitHub answers with a redirect to a signed download; fetch follows it
  // without sending the token on, which is what we want.
  const upstream = await fetch(`https://api.github.com/repos/${CONVENTIONS_REPO}/tarball`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return say(`The studio couldn't read ${CONVENTIONS_REPO} (${upstream.status}). Its token may not be allowed to see it.`, 502);
  }

  return new Response(upstream.body, {
    headers: { "content-type": "application/gzip", "cache-control": "no-store" },
  });
}
