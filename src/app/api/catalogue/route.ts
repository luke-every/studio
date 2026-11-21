import { NextResponse, type NextRequest } from "next/server";

import { workingFile, workingCopiesOn } from "@/lib/registry/local-prototypes";

/**
 * The components panel's list: what the stage (the prototype at ~/Claude/prototypes/stage) can draw, read from its build, so what is listed is exactly
 * what a drop will show. Only on this machine.
 */
export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) return new NextResponse("Not found.", { status: 404 });
  try {
    const file = await workingFile("stage", ["components.json"]);
    const list = file ? ((await file.json()) as { id: string; label: string; group: string; width?: number; height?: number }[]) : null;
    if (list) {
      const items = list.map((one) => ({ id: one.id, title: `${one.group}/${one.label}`, label: one.label, group: one.group, file: null, width: one.width ?? 0, height: one.height ?? 0, stories: 1 }));
      return NextResponse.json({ key: "stage", items }, { headers: { "Cache-Control": "private, no-store" } });
    }
  } catch {
    // Not built, or not readable: told the same.
  }
  return NextResponse.json({ key: null, items: [], stopped: true });
}
