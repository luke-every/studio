import { NextResponse } from "next/server";

import { getPrototype } from "@/lib/registry";

/**
 * Serving a prototype.
 *
 * Blob serves HTML with `content-disposition: attachment` — sensible for a
 * general file store, useless here, because a browser downloads the
 * prototype instead of showing it. So the studio fetches the file itself and
 * returns it inline, from its own domain, where it can be framed.
 *
 * A version's files never change, so this is cached hard and forever. The
 * path is stable and readable, which also makes it a decent thing to paste
 * to somebody.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; version: string }> },
) {
  const { slug, version } = await params;

  const prototype = await getPrototype(slug);
  if (!prototype) {
    return new NextResponse("No such prototype.", { status: 404 });
  }

  // Paths use v0-2 rather than v0.2, so a dot never has to be escaped.
  const wanted = version.replace("-", ".");
  const record = prototype.versions.find((candidate) => candidate.version === wanted);
  if (!record?.fileUrl) {
    return new NextResponse("No files for that version.", { status: 404 });
  }

  const upstream = await fetch(record.fileUrl, { cache: "force-cache" });
  if (!upstream.ok) {
    return new NextResponse("The prototype could not be fetched.", { status: 502 });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable",
      // Nothing here should end up in a search index.
      "x-robots-tag": "noindex",
    },
  });
}
