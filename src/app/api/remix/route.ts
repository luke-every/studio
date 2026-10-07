import { NextResponse, type NextRequest } from "next/server";

import { getPrototypes } from "@/lib/registry";
import { contentRepoAccess, versionPrefix } from "@/lib/registry/github";

/**
 * What a remix needs to copy one version: its name, its team, and the
 * content repository to read its files from. Read-only, behind the studio
 * password, and the same access /push is handed.
 */
export async function GET(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug");
  const version = request.nextUrl.searchParams.get("version");
  const prototype = (await getPrototypes()).find((candidate) => candidate.slug === slug);
  if (!prototype || !prototype.versions.some((candidate) => candidate.version === version)) {
    return NextResponse.json({ error: "The studio has no such prototype version." }, { status: 404 });
  }

  try {
    return NextResponse.json({
      name: prototype.name,
      description: prototype.description,
      team: prototype.teamSlug,
      version,
      prefix: versionPrefix(prototype.slug, version!),
      repository: contentRepoAccess(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't start the remix." }, { status: 400 });
  }
}
