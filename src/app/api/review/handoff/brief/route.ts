import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { NextRequest } from "next/server";

import { briefOf } from "@/lib/handoff-brief";
import { publicHandoff } from "@/lib/handoff-public";
import { parseTarget } from "@/lib/handoff-selection";
import { checkReviewToken } from "@/lib/review";
import { fetchPrototypeFile } from "@/lib/registry/github";
import { findVersion, readHandoff } from "@/lib/registry/handoff";
import { WORKING_SEGMENT, workingFolder } from "@/lib/registry/local-prototypes";

/**
 * The brief for what an engineer picked in a handed-off version (a whole design, or a section of the app's code), as
 * markdown their agent can read (see `handoff-brief.ts`). Opened by its link, with the share link's review token and no
 * password, so an agent can fetch it. The section's lines are read from the version's own source, never its static page.
 */
export async function GET(request: NextRequest) {
  const say = (message: string, status: number) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const params = request.nextUrl.searchParams;
  const slug = params.get("slug") ?? "";
  const folder = params.get("version") ?? "";
  const token = params.get("token") ?? "";
  const selection = parseTarget(params.get("target") ?? "");
  if (!checkReviewToken(token, slug, folder)) return say("This link has run out. Open the share link again for a new one.", 401);
  if (!selection) return say("That isn't something this handoff can give a brief for.", 400);
  try {
    const version = await findVersion(slug, folder.replace(/-/g, "."));
    const data = publicHandoff(await readHandoff(slug, version.key));
    if (!data.ready) return say("Nothing has been handed off for this version yet.", 404);

    // The source of a file in this version: its own folder if it is the one running here, else the content repository's copy.
    const sources = new Map<string, string>();
    if (selection.kind === "section") {
      const file = selection.file;
      let source: string | null = null;
      if (!file.includes("..") && !file.startsWith("/")) {
        if (folder === WORKING_SEGMENT) source = await readFile(join(workingFolder(slug), file), "utf8").catch(() => null);
        else source = await fetchPrototypeFile(slug, folder, ["_source", ...file.split("/")], null).then((response) => (response?.ok ? response.text() : null)).catch(() => null);
      }
      if (source !== null) sources.set(file, source);
    }

    const origin = request.nextUrl.origin;
    const ref = params.get("ref") ?? "";
    const link = (target: string) => `${origin}/api/review/handoff/brief?${new URLSearchParams({ slug, version: folder, token, target, ...(ref ? { ref } : {}) })}`;
    const brief = briefOf(data, selection, {
      origin,
      slug,
      folder,
      name: slug,
      version: version.version,
      canvas: ref.startsWith(`${origin}/`) ? `${ref.split("#")[0]}#canvas` : undefined,
      briefLink: link,
      source: (file) => sources.get(file) ?? null,
    });
    return brief ? new Response(brief, { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" } }) : say("That isn't in this handoff.", 404);
  } catch {
    return say("Nothing has been handed off for this version yet.", 404);
  }
}
