import { NextResponse } from "next/server";

import { guessContentType } from "@/lib/registry/content-type";
import { getPrototype } from "@/lib/registry";

/**
 * Serving a prototype.
 *
 * A version is a real folder of files now, not necessarily one. This route
 * serves any path inside it — `/p/slug/v0-2` for the entry, or
 * `/p/slug/v0-2/style.css` for anything alongside it — by fetching the
 * matching file from wherever it actually lives (raw.githubusercontent.com
 * for anything pushed since the move to a content repository; an old
 * prototype's Blob URL still resolves the same way) and returning it inline
 * with a content type worked out from its own extension.
 *
 * Content served straight from GitHub answers `text/plain` with `nosniff`
 * for everything, which a browser won't execute as a script or apply as a
 * stylesheet — so this always proxies rather than redirecting, and always
 * sets its own content type rather than trusting the one upstream sent.
 *
 * A version's files never change, so this is cached hard and forever.
 *
 * The body is streamed, never buffered, which is what lets a file past a
 * Vercel Function's 4.5MB response limit through. A range request is passed
 * on as one, because Safari won't play a video from a server that can't
 * answer a byte range.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; version: string; path?: string[] }> },
) {
  const { slug, version, path } = await params;

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

  const relativePath = path?.join("/") || "index.html";
  const targetUrl =
    relativePath === "index.html" ? record.fileUrl : record.fileUrl.replace(/index\.html$/, relativePath);

  const range = request.headers.get("range");
  const upstream = await fetch(
    targetUrl,
    range ? { headers: { range }, cache: "no-store" } : { cache: "force-cache" },
  );
  if (!upstream.ok) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const headers = new Headers({
    "content-type": relativePath === "index.html" ? "text/html; charset=utf-8" : guessContentType(relativePath),
    "cache-control": "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    // Nothing here should end up in a search index.
    "x-robots-tag": "noindex",
  });
  // fetch has already decompressed a gzipped body, so its length only
  // holds when upstream sent it uncompressed.
  const passThrough = upstream.headers.get("content-encoding") ? ["content-range"] : ["content-length", "content-range"];
  for (const name of passThrough) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
