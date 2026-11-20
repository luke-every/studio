import { spawn } from "node:child_process";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";

/**
 * Starts the terminal helper (`scripts/terminal-server.mjs`) when it isn't running: the terminal panel's Start button.
 * Only on this machine, and only from the studio's own page. The helper is started on its own, so it keeps running
 * when the studio restarts.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!workingCopiesOn() || (origin && new URL(origin).host !== request.headers.get("host"))) {
    return new NextResponse("Not found.", { status: 404 });
  }
  // Any answer at all, even a refusal, means it is there.
  const running = await fetch("http://127.0.0.1:4748/", { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
  if (!running) {
    spawn(process.execPath, [join(process.cwd(), "scripts", "terminal-server.mjs")], { cwd: process.cwd(), detached: true, stdio: "ignore" }).unref();
  }
  return NextResponse.json({ started: !running });
}
