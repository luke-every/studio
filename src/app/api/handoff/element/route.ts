import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { NextRequest } from "next/server";

import { elementBrief } from "@/lib/element-brief";
import { mayReadHandoff } from "@/lib/handoff-access";
import { fetchPrototypeFile } from "@/lib/registry/github";
import { buildChangeSet } from "@/lib/registry/change-set";
import { findVersion } from "@/lib/registry/handoff";
import { WORKING_SEGMENT, workingFolder } from "@/lib/registry/local-prototypes";

/**
 * One element's code, as text an engineer's agent can read: the element, the imports it needs, and links to the rest (see `element-brief.ts`). Opened by its link
 * with a review token and no password. With `file` instead of `loc`, the whole file. Read from the version's own source, never its static page.
 */
export async function GET(request: NextRequest) {
  const say = (message: string, status: number, type = "text/plain") => new Response(message, { status, headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" } });
  const params = request.nextUrl.searchParams;
  const slug = params.get("slug") ?? "";
  const folder = params.get("version") ?? "";
  const token = params.get("token") ?? "";
  const loc = /^(src\/.+):(\d+):(\d+)$/.exec(params.get("loc") ?? "");
  const whole = params.get("file") ?? "";
  const file = loc?.[1] ?? whole;
  if (!file || file.includes("..") || file.startsWith("/") || !file.startsWith("src/")) return say("That isn't a file this link can give.", 400);
  try {
    const version = await findVersion(slug, folder.replace(/-/g, "."));
    if (!(await mayReadHandoff(token, slug, folder, version.key))) return say("This link has run out. Copy it again from the studio.", 401);
    const source =
      folder === WORKING_SEGMENT
        ? await readFile(join(workingFolder(slug), file), "utf8").catch(() => null)
        : await fetchPrototypeFile(slug, folder, ["_source", ...file.split("/")], null).then((response) => (response?.ok ? response.text() : null)).catch(() => null);
    if (source === null) return say("That file isn't in this version.", 404);
    if (!loc) return say(source, 200, "text/plain");

    const github = params.get("github");
    const fileLinks = [`${request.nextUrl.origin}/api/handoff/element?${new URLSearchParams({ slug, version: folder, token, file })}`, ...(github ? [`${github}/${file}`] : [])];
    // Which files are a fork's, and what each is against production: a direct copy, an extended version, or new. Known on the machine the files are on.
    const said = new Map<string, string>();
    if (folder === WORKING_SEGMENT) {
      for (const fork of (await buildChangeSet(slug, slug).catch(() => null))?.forks ?? []) {
        for (const one of fork.files) {
          const at = fork.production ?? one.against ?? fork.basedOn;
          said.set(
            one.path.replace(/\.tsx?$/, ""),
            one.status === "same" ? `a direct copy of \`${at}\`, unchanged (${fork.name}).` : one.status === "changed" ? `an extended version of \`${at}\`: +${one.added} −${one.removed} lines (${fork.name}).` : `new, not in production${one.against ? ` (${one.against})` : ""} (${fork.name}).`,
          );
        }
      }
    }
    const brief = elementBrief(source, { file, line: Number(loc[2]), column: Number(loc[3]), fileLinks, production: params.get("production") ?? undefined, origin: (path) => said.get(path.replace(/\/index$/, "")) ?? said.get(`${path}/index`) ?? null });
    return brief ? say(brief, 200, "text/markdown") : say("That element isn't in this file any more.", 404);
  } catch {
    return say("That version isn't available.", 404);
  }
}
