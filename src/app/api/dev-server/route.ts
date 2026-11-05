import { NextResponse, type NextRequest } from "next/server";

import { stopDevServer, workingCopiesOn } from "@/lib/registry/local-prototypes";

/** Stops the dev server of a prototype in ~/Claude/prototypes. Only on this machine, and only from the studio's own page. */
export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9-]+$/.test(slug)) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json({ stopped: await stopDevServer(slug) });
}
