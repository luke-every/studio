import { NextResponse, type NextRequest } from "next/server";

import { anchorSchema } from "@/lib/comments";
import { checkReviewToken } from "@/lib/review";
import * as comments from "@/lib/registry/comments";

/**
 * Where a comment left from a phone lands. The phone has no password and no
 * cookie; what it has is a review token from the QR code, good for adding
 * comments to one version and nothing else.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  // The address's form (v0-2); comments are filed under the dotted one.
  const folder = typeof body?.version === "string" ? body.version : "";
  if (!body || !checkReviewToken(typeof body.token === "string" ? body.token : null, slug, folder)) {
    return NextResponse.json({ error: "This review link has run out. Scan the code again." }, { status: 401 });
  }

  const anchor = anchorSchema.safeParse(body.anchor);
  if (!anchor.success) return NextResponse.json({ error: "That comment couldn't be placed." }, { status: 400 });

  try {
    const comment = await comments.addComment({
      slug,
      version: folder.replace(/-/g, "."),
      text: typeof body.text === "string" ? body.text : "",
      anchor: anchor.data,
      variant: typeof body.variant === "string" && body.variant ? body.variant : undefined,
      by: typeof body.by === "string" ? body.by.slice(0, 40) : undefined,
      avatar: typeof body.avatar === "number" ? body.avatar : undefined,
    });
    return NextResponse.json({ ok: true, n: comment.n });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Something failed." }, { status: 400 });
  }
}
