import { NextResponse, type NextRequest } from "next/server";

import { publicHandoff } from "@/lib/handoff-public";
import { checkReviewToken } from "@/lib/review";
import { findVersion, readHandoff } from "@/lib/registry/handoff";

/**
 * A version's handoff for somebody with only its share link, who has no password and no cookie: what they have is the
 * link's review token, good for reading that one version (see `/api/review/comments`). Only a handoff that has been
 * signed off is given, and in the lean form of `publicHandoff`.
 */
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  // The address's form (v0-2); the handoff is filed under the dotted one.
  const folder = request.nextUrl.searchParams.get("version") ?? "";
  if (!checkReviewToken(request.nextUrl.searchParams.get("token"), slug, folder)) {
    return NextResponse.json({ error: "This link has run out." }, { status: 401 });
  }
  try {
    const version = await findVersion(slug, folder.replace(/-/g, "."));
    return NextResponse.json(publicHandoff(await readHandoff(slug, version.key)), { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json(publicHandoff(null));
  }
}
