import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";

/** The stage prototype's list of stories (see its scripts/build-registry.mjs): every way each component can be shown. Only on this machine. */
const REGISTRY = join(homedir(), "Claude", "prototypes", "stage", "src", "lib", "stage-registry.js");

/** Each component's variants, by the part of a story's id before `--`: `{ "shared-button": [{ id: "shared-button--dark", name: "Dark" }, …] }`. */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) return new NextResponse("Not found.", { status: 404 });
  try {
    const source = await readFile(REGISTRY, "utf8");
    const groups: Record<string, { id: string; name: string }[]> = {};
    for (const match of source.matchAll(/^\s*"([^"]+)":\s*\{\s*name:\s*"([^"]+)"/gm)) {
      const [, id, name] = match;
      (groups[id.split("--")[0]] ??= []).push({ id, name });
    }
    return NextResponse.json({ stories: groups }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return NextResponse.json({ stories: {} });
  }
}
