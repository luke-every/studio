import type { NextRequest } from "next/server";

import { mayReadHandoff } from "@/lib/handoff-access";
import { readCanvas } from "@/lib/registry/canvas";
import { findVersion } from "@/lib/registry/handoff";
import { liveOrigin, WORKING_SEGMENT, workingCopiesOn } from "@/lib/registry/local-prototypes";
import { takeShot } from "@/lib/registry/shot";
import type { Step } from "@/lib/state-replay";

/**
 * A picture of the prototype as it runs, for an engineer's agent to match its work against: the page, one element of it (`loc`, where its markup is written, as in the
 * element link), or a state kept on the canvas (`state`, its id), at a width. Opened by its link with a review token and no password, like the element link. Only where the
 * prototype is running (this machine): there is no browser to take it with anywhere else, so a pushed version's pictures are the ones taken when it is pushed.
 */
export async function GET(request: NextRequest) {
  const say = (message: string, status: number) => new Response(message, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const params = request.nextUrl.searchParams;
  const slug = params.get("slug") ?? "";
  const folder = params.get("version") ?? "";
  const token = params.get("token") ?? "";
  const loc = params.get("loc") ?? "";
  const stateId = params.get("state") ?? "";
  const page = params.get("page") ?? "/";
  const width = Number(params.get("width") ?? 390);
  if (!Number.isInteger(width) || width < 320 || width > 1920) return say("A width is 320 to 1920.", 400);
  if (loc && !/^src\/[\w./()[\]@-]+\.tsx:\d+:\d+$/.test(loc)) return say("That isn't a place in the code.", 400);
  if (!/^\/[\w\-./]*$/.test(page)) return say("That isn't a page.", 400);
  if (folder !== WORKING_SEGMENT || !workingCopiesOn()) return say("A picture is taken where the prototype runs, which is the machine it is being made on.", 404);
  try {
    const version = await findVersion(slug, folder.replace(/-/g, "."));
    if (!(await mayReadHandoff(token, slug, folder, version.key))) return say("This link has run out. Copy it again from the studio.", 401);
    const live = await liveOrigin(slug);
    if (!live) return say("The prototype isn't running here: start it, then ask again.", 404);

    let path = page;
    let query = new URLSearchParams({ studio: "1" });
    let steps: Step[] | undefined;
    let at = width;
    if (stateId) {
      const piece = ((await readCanvas(slug, version.key))?.canvas.pieces ?? []).find((one) => one.id === stateId && one.kind === "state") as { width?: number; state?: { url: string; params?: Record<string, string>; steps: Step[] } } | undefined;
      if (!piece?.state) return say("That state isn't on the canvas.", 404);
      const address = new URL(piece.state.url, "http://studio.local");
      path = address.pathname.replace(new RegExp(`^/p/${slug}/${WORKING_SEGMENT}`), "") || "/";
      query = new URLSearchParams({ ...Object.fromEntries(address.searchParams), ...(piece.state.params ?? {}), studio: "1" });
      steps = piece.state.steps;
      at = Number(params.get("width")) || piece.width || width;
    }
    const png = await takeShot({ url: `${live}${path}?${query}`, width: at, loc: loc || undefined, steps });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (error) {
    return say(error instanceof Error ? error.message : "The picture couldn't be taken.", 500);
  }
}
