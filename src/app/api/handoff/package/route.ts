import { NextResponse, type NextRequest } from "next/server";

import { briefOf } from "@/lib/handoff-package";
import { buildChangeSet } from "@/lib/registry/change-set";
import { workingCopiesOn } from "@/lib/registry/local-prototypes";

/**
 * A prototype's handoff brief as plain text (or `?format=json`), for an agent to fetch by link. Only on this machine, where the prototype's files are, and only from
 * the studio's own address; what is pushed will carry its own copy beside the version.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) return new NextResponse("Not found.", { status: 404 });
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new NextResponse("Not found.", { status: 404 });
  try {
    const set = await buildChangeSet(slug, slug);
    if (request.nextUrl.searchParams.get("format") === "json") return NextResponse.json(set, { headers: { "Cache-Control": "no-store" } });
    return new NextResponse(briefOf(set, { origin: request.nextUrl.origin, canvas: `${request.nextUrl.origin}/prototypes/${slug}?canvas=1` }), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("That prototype isn't on this machine.", { status: 404 });
  }
}
