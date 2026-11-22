import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { NextRequest } from "next/server";

import { coloursIn, elementBrief, usedComponents, type NoteLine, type Picture, type Used, type Ways } from "@/lib/element-brief";
import { controlsSchema } from "@/lib/controls";
import { DEVICES } from "@/lib/phone";
import { mayReadHandoff } from "@/lib/handoff-access";
import { fetchPrototypeFile } from "@/lib/registry/github";
import { readCanvas } from "@/lib/registry/canvas";
import { readComments } from "@/lib/registry/comments";
import { buildChangeSet } from "@/lib/registry/change-set";
import { findVersion } from "@/lib/registry/handoff";
import { counterpartOf, productionText, provenanceOf } from "@/lib/registry/production";
import { liveOrigin, WORKING_SEGMENT, workingFolder } from "@/lib/registry/local-prototypes";
import { chromeHere } from "@/lib/registry/shot";

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
    const read = (path: string) =>
      folder === WORKING_SEGMENT
        ? readFile(join(workingFolder(slug), path), "utf8").catch(() => null)
        : fetchPrototypeFile(slug, folder, ["_source", ...path.split("/")], null).then((response) => (response?.ok ? response.text() : null)).catch(() => null);
    const source = await read(file);
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

    const [line, column] = [Number(loc[2]), Number(loc[3])];
    const origin = request.nextUrl.origin;
    const fileLink = (path: string) => `${origin}/api/handoff/element?${new URLSearchParams({ slug, version: folder, token, file: path })}`;

    // The components the section uses: where each one's file is (the studio's link, and GitHub's), how it stands against production, and what it marks as left.
    const uses: Record<string, Used> = {};
    for (const { target } of usedComponents(source, file, line, column)) {
      if (uses[target]) continue;
      let found: { path: string; text: string } | null = null;
      for (const candidate of [`${target}.tsx`, `${target}.ts`, `${target}/index.tsx`]) {
        const text = await read(candidate);
        if (text !== null) {
          found = { path: candidate, text };
          break;
        }
      }
      const against = found ? await counterpartOf(found.path) : null;
      const theirs = against?.path ? await productionText(against.path) : null;
      uses[target] = {
        source: found?.text,
        colours: found ? coloursIn(found.text) : [],
        links: found ? [fileLink(found.path), ...(github ? [`${github}/${found.path}`] : [])] : [],
        against,
        identical: found && theirs !== null ? theirs.trim() === found.text.trim() : undefined,
        productionSource: theirs ?? undefined,
        provenance: found ? provenanceOf(found.text) : null,
        todos: (found?.text ?? "").split("\n").flatMap((row, at) => (row.includes("TODO(lift)") ? [{ line: at + 1, text: row.replace(/^[\s/{*]+|[\s*/}]+$/g, "").replace(/^TODO\(lift\):?\s*/, "").slice(0, 200) }] : [])),
      };
    }

    // What the file says about where it comes from, and production's file it is compared with, section by section (where production is on this machine).
    const provenance = provenanceOf(source);
    const counterpart = await counterpartOf(file);
    const production = provenance?.production ?? params.get("production") ?? (counterpart?.status === "none" ? undefined : counterpart?.path);
    const productionSource = production ? await productionText(production) : null;

    // The designer's note on the version, and the states kept on its canvas.
    // A note says something only when it has what changed, or a title that is more than the prototype's own name or the studio's placeholder.
    const named = (version.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") === slug;
    const plain = folder === WORKING_SEGMENT || (!version.changes?.trim() && (!version.title || named || /^(Version v|First version)/.test(version.title)));
    const canvas = await readCanvas(slug, version.key).catch(() => null);

    // Pictures, where there is a Chrome here and the prototype is running: the section, the page, and each kept state, at the sizes the canvas draws. A pushed version's
    // pictures are the ones taken when it was pushed; there is no browser to make them here.
    const pictureAt = chromeHere() && folder === WORKING_SEGMENT && (await liveOrigin(slug)) ? (extra: Record<string, string>, width: number) => `${origin}/api/handoff/shot?${new URLSearchParams({ slug, version: folder, token, width: String(width), ...extra })}` : null;
    const widths = [390, 820, 1440];
    const pictures: Picture[] = pictureAt
      ? [
          { label: "This section", links: widths.map((width) => ({ width, url: pictureAt({ loc: `${file}:${line}:${column}` }, width) })) },
          { label: "The whole page", links: widths.map((width) => ({ width, url: pictureAt({}, width) })) },
        ]
      : [];
    const states = (canvas?.canvas.pieces ?? []).flatMap((piece) => {
      if (piece.kind !== "state") return [];
      const steps = Array.isArray((piece.state as { steps?: unknown[] } | undefined)?.steps) ? (piece.state as { steps: unknown[] }).steps.length : 0;
      const width = Number(piece.width) || 390;
      return [{ name: String(piece.label ?? "State"), steps, pictures: pictureAt ? [{ width, url: pictureAt({ state: String(piece.id) }, width) }] : undefined }];
    });

    // Notes left for the developers on this version (not resolved), each with its replies.
    const near = new Set((params.get("notes") ?? "").split(",").filter(Boolean));
    const everyone = await readComments(slug, version.key).catch(() => []);
    const notes: NoteLine[] = everyone
      .filter((item) => item.note && !item.parentId && !item.resolvedAt)
      .slice(0, 30)
      .map((item) => ({
        n: item.n,
        author: item.author.name,
        text: item.text,
        device: DEVICES.find((one) => one.id === item.device)?.name,
        anchorText: item.anchor.text,
        related: near.has(item.id),
        replies: everyone.filter((reply) => reply.parentId === item.id).map((reply) => ({ author: reply.author.name, text: reply.text })),
      }));

    const studioJson = await read("public/studio.json");
    // The ways to see it: the sizes the canvas draws, and the prototype's controls (each a parameter of its address).
    const parsedControls = controlsSchema.safeParse(
      (() => {
        try {
          return JSON.parse(studioJson ?? "{}");
        } catch {
          return {};
        }
      })(),
    );
    const ways: Ways = {
      devices: (canvas?.canvas.devices ?? []).flatMap((id) => DEVICES.filter((one) => one.id === id).map((one) => ({ name: one.name, width: one.width }))),
      controls: (parsedControls.success ? parsedControls.data.controls : []).flatMap((control) =>
        control.type === "choice" ? [{ label: control.label, param: control.param ?? control.id, options: control.options, fallback: control.default }] : control.type === "multi" ? [{ label: control.label, param: control.param ?? control.id, options: control.options }] : control.type === "toggle" ? [{ label: control.label, param: control.param ?? control.id, options: [{ value: control.value, label: "on" }] }] : [],
      ),
    };

    const brief = elementBrief(source, {
      file,
      line,
      column,
      fileLinks,
      production,
      uses,
      provenance,
      against: production && productionSource !== null ? { path: production, source: productionSource } : null,
      design: `${origin}/prototypes/${slug}?${folder === WORKING_SEGMENT ? "" : `v=${version.version}&`}canvas=1`,
      note: plain ? null : { version: version.version, title: version.title, changes: version.changes },
      states,
      notes,
      pictures,
      ways,
      origin: (path) => said.get(path.replace(/\/index$/, "")) ?? said.get(`${path}/index`) ?? null,
    });
    return brief ? say(brief, 200, "text/markdown") : say("That element isn't in this file any more.", 404);
  } catch {
    return say("That version isn't available.", 404);
  }
}
