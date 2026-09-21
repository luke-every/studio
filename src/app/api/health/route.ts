import { NextResponse, type NextRequest } from "next/server";

import { isBlobConfigured } from "@/lib/registry/blob";
import { getPrototypes, getTeams } from "@/lib/registry";

/**
 * What the deployment can actually see.
 *
 * Names only, never values — enough to tell whether storage is wired up and
 * which variables the platform injected, without printing a secret into
 * somebody's terminal.
 */
export async function GET(request: NextRequest) {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (password && request.headers.get("x-studio-password")?.trim() !== password) {
    return NextResponse.json({ error: "Wrong or missing studio password." }, { status: 401 });
  }

  const blobVariables = Object.keys(process.env)
    .filter((key) => key.startsWith("BLOB_") || key.includes("BLOB"))
    .sort();

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
    storage: isBlobConfigured() ? "configured" : "missing BLOB_READ_WRITE_TOKEN",
    blobVariables,
    reads,
    teams,
    prototypes,
  });
}
