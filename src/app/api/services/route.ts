import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";
import { control, listServices, type Action } from "@/lib/services";

/** Only on this machine, and only from the studio's own page. */
function allowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  return workingCopiesOn() && !(origin && new URL(origin).host !== request.headers.get("host"));
}

/** Everything that runs here, and whether it is up. */
export async function GET(request: NextRequest) {
  if (!allowed(request)) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json({ services: await listServices() });
}

/** Starts, stops or restarts one (`id`, `action`). It answers when that is done, which can take a few seconds. */
export async function POST(request: NextRequest) {
  if (!allowed(request)) return new NextResponse("Not found.", { status: 404 });
  const { id, action } = (await request.json().catch(() => ({}))) as { id?: string; action?: string };
  if (typeof id !== "string" || (action !== "start" && action !== "stop" && action !== "restart")) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json(await control(id, action as Action));
}
