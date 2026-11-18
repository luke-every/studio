import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";

/** Where scripts/build-catalogue.mjs keeps the components panel's pictures. Only on this machine. */
const ROOT = join(homedir(), ".prototype-studio", "catalogue");

/** The list the panel draws: the newest set of pictures, with what each is called and how big it is. */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) return new NextResponse("Not found.", { status: 404 });
  try {
    const { key } = JSON.parse(await readFile(join(ROOT, "current.json"), "utf8")) as { key: string };
    const { items } = JSON.parse(await readFile(join(ROOT, key, "manifest.json"), "utf8")) as { items: unknown[] };
    return NextResponse.json({ key, items }, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    // Nothing made yet: the panel says what to run.
    return NextResponse.json({ key: null, items: [] });
  }
}
