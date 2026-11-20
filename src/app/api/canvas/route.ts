import { NextResponse, type NextRequest } from "next/server";

import { isUnlocked } from "@/lib/gate";
import { canvasPatchSchema } from "@/lib/canvas-doc";
import { saveCanvasPatch } from "@/lib/registry/canvas";
import { userMessage } from "@/lib/registry/errors";

/**
 * A canvas's changes, sent as the page closes. A server action is a request the browser may cancel once the page is gone; this is a plain one, sent with
 * `keepalive` (which the browser finishes after the page has gone, for a body under 64KB), and carries the same patch the action does. The door is checked
 * here, as the cookie comes with the request. Only the studio's own pages may send it.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return new NextResponse("Not found.", { status: 404 });
  if (!(await isUnlocked())) return NextResponse.json({ ok: false, error: "The studio is locked." }, { status: 401 });
  try {
    const body = (await request.json()) as { slug?: unknown; version?: unknown; patch?: unknown; by?: unknown };
    if (typeof body.slug !== "string" || typeof body.version !== "string") return NextResponse.json({ ok: false, error: "That isn't a canvas." }, { status: 400 });
    const savedAt = await saveCanvasPatch(body.slug, body.version, canvasPatchSchema.parse(body.patch), typeof body.by === "string" ? body.by : undefined);
    return NextResponse.json({ ok: true, savedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, error: userMessage(error, "It couldn't be saved.") }, { status: 400 });
  }
}
