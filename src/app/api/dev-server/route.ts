import { NextResponse, type NextRequest } from "next/server";

import { restartDevServer, startDevServer, stopDevServer, workingCopiesOn } from "@/lib/registry/local-prototypes";

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

/** Starts or restarts it (`action`). It answers when the server is up, which can take a few seconds. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) {
    return new NextResponse("Not found.", { status: 404 });
  }
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const action = request.nextUrl.searchParams.get("action");
  if (!/^[a-z0-9-]+$/.test(slug) || (action !== "start" && action !== "restart")) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json(action === "start" ? await startDevServer(slug) : await restartDevServer(slug));
}
