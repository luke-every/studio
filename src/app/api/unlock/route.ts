import { NextResponse, type NextRequest } from "next/server";

import { unlock } from "@/lib/gate";

/**
 * Says the word at the door. A route rather than a server action because a
 * server action that sets a cookie re-renders the page it was called from,
 * and the door page leaves as soon as it is open, cutting the welcome short.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const opened = await unlock(typeof body?.password === "string" ? body.password : "");
  return opened ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false }, { status: 401 });
}
