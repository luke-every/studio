import { NextResponse, type NextRequest } from "next/server";

import { isContentRepoConfigured } from "@/lib/registry/github";
import { getPrototypes, getTeams } from "@/lib/registry";

/**
 * What the deployment can actually see — whether storage is wired up,
 * without printing a secret into somebody's terminal.
 */
export async function GET(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  let reads: string;
  let teams = 0;
  let prototypes = 0;
  try {
    teams = (await getTeams()).length;
    prototypes = (await getPrototypes()).length;
    reads = "ok";
  } catch (error) {
    reads = error instanceof Error ? error.message : "failed";
  }

  return NextResponse.json({
    // Which build is answering. "The fix is deployed" is otherwise a guess,
    // and a studio that looks unchanged after a push is exactly the thing
    // this endpoint exists to tell you about.
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    contentRepo: isContentRepoConfigured() ? "configured" : "missing STUDIO_GITHUB_TOKEN or STUDIO_CONTENT_REPO",
    reads,
    teams,
    prototypes,
  });
}
