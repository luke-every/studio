import { NextResponse, type NextRequest } from "next/server";

import { contentRepoAccess } from "@/lib/registry/github";
import * as registry from "@/lib/registry/write";

/**
 * The first half of /push.
 *
 * Says which version this upload will become and hands back the content
 * repository to commit it to. The files themselves never come through here:
 * a Vercel Function can't accept a request over 4.5MB, and a prototype is
 * routinely bigger than that, so /push writes them to GitHub directly and
 * then tells /api/push the commit.
 */
export async function POST(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; slug?: string; team?: string; version?: string }
    | null;
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "A prototype needs a `name`." }, { status: 400 });
  }

  try {
    const planned = await registry.reserveVersion({
      name,
      slug: body?.slug?.trim() || undefined,
      teamSlug: body?.team?.trim() || undefined,
      version: body?.version?.trim() || undefined,
    });
    return NextResponse.json({ ...planned, repository: contentRepoAccess() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't start the push." },
      { status: 400 },
    );
  }
}
