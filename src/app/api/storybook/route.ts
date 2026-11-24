import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";
import { startStorybook } from "@/lib/services";

const PORT = 6006;

async function running() {
  try {
    await fetch(`http://localhost:${PORT}`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

/** Only on this machine, and only from the studio's own page. */
function allowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  return workingCopiesOn() && !(origin && new URL(origin).host !== request.headers.get("host"));
}

/** Is Storybook up? */
export async function GET(request: NextRequest) {
  if (!allowed(request)) return new NextResponse("Not found.", { status: 404 });
  return NextResponse.json({ running: await running() });
}

/** Starts Storybook for the website. It lives as long as the studio does. */
export async function POST(request: NextRequest) {
  if (!allowed(request)) return new NextResponse("Not found.", { status: 404 });
  await startStorybook();
  return NextResponse.json({ starting: true });
}
