import { NextResponse, type NextRequest } from "next/server";

import { getPrototypes, getTeams } from "@/lib/registry";

/**
 * What is already in the studio.
 *
 * /push reads this to decide whether it is saving a new prototype or the
 * next version of one that exists, and which teams it could belong to.
 * Small and boring on purpose.
 */
export async function GET(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  const [prototypes, teams] = await Promise.all([getPrototypes(), getTeams()]);

  return NextResponse.json({
    teams: teams.map((team) => ({ slug: team.slug, name: team.name })),
    prototypes: prototypes.map((prototype) => ({
      slug: prototype.slug,
      name: prototype.name,
      team: prototype.teamSlug,
      project: prototype.projectSlug,
      latest: prototype.current.version,
    })),
  });
}
