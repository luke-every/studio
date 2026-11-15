import { spawn, type ChildProcess } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn } from "@/lib/registry/local-prototypes";

const PORT = 6006;
const PROJECT = join(homedir(), "Claude", "every-website-main");

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

/** Stops Storybook with the studio: it runs in its own process group, so the whole tree goes. */
function stopWithStudio(child: ChildProcess) {
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid);
    } catch {}
  };
  process.once("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stop();
      process.kill(process.pid, signal);
    });
  }
}

/** Starts Storybook for the website. It lives as long as the studio does. */
export async function POST(request: NextRequest) {
  if (!allowed(request)) return new NextResponse("Not found.", { status: 404 });
  if (!(await running())) {
    const child = spawn(join(PROJECT, "node_modules", ".bin", "storybook"), ["dev", "-p", String(PORT), "--no-open"], {
      cwd: PROJECT,
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {});
    stopWithStudio(child);
  }
  return NextResponse.json({ starting: true });
}
