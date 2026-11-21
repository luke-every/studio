import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn, workingFolder } from "@/lib/registry/local-prototypes";

/** The copies of components a project has made (`.studio/forks.json`, written by the helper), for the components panel. Only on this machine, where the folder is. */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) return new NextResponse("Not found.", { status: 404 });
  try {
    const text = await readFile(join(workingFolder(request.nextUrl.searchParams.get("slug") ?? ""), ".studio", "forks.json"), "utf8");
    const all = JSON.parse(text) as Record<string, { label?: string }>;
    return NextResponse.json({ forks: Object.entries(all).map(([id, one]) => ({ id, label: one.label ?? id })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ forks: [] });
  }
}
