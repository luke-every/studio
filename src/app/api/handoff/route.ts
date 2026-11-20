import { NextResponse, type NextRequest } from "next/server";

import { carryHandoff, findVersion, readHandoff, saveFindings } from "@/lib/registry/handoff";
import { userMessage } from "@/lib/registry/errors";

/**
 * Where /handoff lands, and where it reads the decisions back from.
 *
 * POST: the findings the skill scanned on the designer's machine, for one version. They are small (no files), so they
 * come through here rather than to GitHub directly as /push's files do. GET: the handoff as it stands, decisions and
 * sign-off included, for Claude Code to apply once the designer asks it to.
 *
 * Authorised with the studio password, the same word that opens the interface, as /api/push is.
 */
function locked(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  return !!password && request.headers.get("x-studio-password")?.trim() !== password;
}
const refused = () => NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
const failed = (error: unknown) => NextResponse.json({ error: userMessage(error, "Something failed.") }, { status: 400 });

export async function POST(request: NextRequest) {
  if (locked(request)) return refused();
  const body = (await request.json().catch(() => null)) as { slug?: unknown; version?: unknown; handoff?: unknown; carried?: unknown; changedSince?: unknown } | null;
  if (typeof body?.slug !== "string" || typeof body.version !== "string" || !body.handoff) {
    return NextResponse.json({ error: "A handoff needs a `slug`, a `version` and the `handoff` the scanner wrote." }, { status: 400 });
  }
  try {
    // /push brings the designer's handoff along to the version it has made: stored as it is, not scanned again.
    if (body.carried === true) {
      const carried = await carryHandoff({ slug: body.slug, version: body.version, handoff: body.handoff, changedSince: Array.isArray(body.changedSince) ? body.changedSince.filter((file): file is string => typeof file === "string") : undefined });
      return NextResponse.json({ ok: true, ...carried });
    }
    const saved = await saveFindings({ slug: body.slug, version: body.version, handoff: body.handoff });
    // The prototype's page at that version, with its handoff open over it.
    const review = new URL(`/prototypes/${body.slug}`, request.nextUrl.origin);
    review.searchParams.set("v", saved.version);
    review.hash = "handoff";
    return NextResponse.json({ ok: true, ...saved, review: review.toString() });
  } catch (error) {
    return failed(error);
  }
}

export async function GET(request: NextRequest) {
  if (locked(request)) return refused();
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const version = request.nextUrl.searchParams.get("version") ?? "";
  try {
    const handoff = await readHandoff(slug, (await findVersion(slug, version)).key);
    if (!handoff) return NextResponse.json({ error: `Nothing has been handed off for ${slug} ${version} yet.` }, { status: 404 });
    return NextResponse.json({ handoff });
  } catch (error) {
    return failed(error);
  }
}
