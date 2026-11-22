import { NextResponse, type NextRequest } from "next/server";

import { isUnlocked } from "@/lib/gate";
import { patchSharedCanvas } from "@/lib/registry/actions";
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
  try {
    const body = (await request.json()) as { slug?: unknown; version?: unknown; patch?: unknown; by?: unknown; token?: unknown; owner?: unknown };
    // A share link's notes, sent as its page closes: the link is what lets it in, not the cookie, and it can only add its own notes.
    if (typeof body.token === "string") {
      const saved = await patchSharedCanvas(body.token, body.patch, typeof body.owner === "string" ? body.owner : "", typeof body.by === "string" ? body.by : undefined);
      return NextResponse.json(saved.ok ? { ok: true, savedAt: saved.value } : { ok: false, error: saved.error }, { status: saved.ok ? 200 : 400 });
    }
    if (!(await isUnlocked())) return NextResponse.json({ ok: false, error: "The studio is locked." }, { status: 401 });
    if (typeof body.slug !== "string" || typeof body.version !== "string") return NextResponse.json({ ok: false, error: "That isn't a canvas." }, { status: 400 });
    const savedAt = await saveCanvasPatch(body.slug, body.version, canvasPatchSchema.parse(body.patch), typeof body.by === "string" ? body.by : undefined);
    return NextResponse.json({ ok: true, savedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, error: userMessage(error, "It couldn't be saved.") }, { status: 400 });
  }
}
