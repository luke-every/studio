import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";

const ROOT = join(homedir(), ".prototype-studio", "catalogue");

/**
 * One component's picture. Its address holds the set it belongs to (the production commit and the stories it was made
 * from), so a picture at an address never changes and the browser may keep it for good: after the first visit the
 * panel's pictures come from its cache, with no request at all.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string; file: string }> }) {
  const { key, file } = await params;
  if (!workingCopiesOn() || !/^[0-9a-f]{7}-[0-9a-f]{6}$/.test(key) || !/^[a-z0-9_.-]+\.webp$/i.test(file)) return new NextResponse("Not found.", { status: 404 });
  try {
    return new NextResponse(await readFile(join(ROOT, key, file)), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
}
