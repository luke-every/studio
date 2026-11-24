import { existsSync, watch } from "node:fs";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { workingCopiesOn, workingFolder } from "@/lib/registry/local-prototypes";

export const dynamic = "force-dynamic";

/** A change that comes in a burst (an editor writes, then renames) is one. */
const SETTLE_MS = 150;
/** A line now and then, so nothing between here and the page takes the stream for dead. */
const KEEP_ALIVE_MS = 25_000;

/**
 * Says when a prototype's `public/studio.json` changes, so the controls and variants its agent writes show up as they are written, with nothing asked for in between.
 * An event stream: one `changed` message for each change, and nothing otherwise. Only on this machine, for a prototype with a folder here, and only from the studio's own page.
 */
export function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  let folder: string | null = null;
  try {
    folder = workingCopiesOn() ? join(workingFolder(slug), "public") : null;
  } catch {
    folder = null;
  }
  if (!folder || !existsSync(folder) || (origin && new URL(origin).host !== request.headers.get("host"))) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const watcher = watch(folder, (_event, name) => {
        if (name && name !== "studio.json") return;
        clearTimeout(timer);
        timer = setTimeout(() => send("data: changed\n\n"), SETTLE_MS);
      });
      watcher.on("error", () => stop());
      const alive = setInterval(() => send(": still here\n\n"), KEEP_ALIVE_MS);
      stop = () => {
        clearTimeout(timer);
        clearInterval(alive);
        watcher.close();
        try {
          controller.close();
        } catch {}
        stop = () => {};
      };
      request.signal.addEventListener("abort", () => stop());
      send("retry: 3000\n\n");
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store, no-transform", connection: "keep-alive" } });
}
