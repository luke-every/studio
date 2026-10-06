import { NextResponse } from "next/server";

import { guessContentType } from "@/lib/registry/content-type";
import { fetchPrototypeFile } from "@/lib/registry/github";
import { getPrototype } from "@/lib/registry";

/**
 * Serving a prototype.
 *
 * A version is a real folder of files, not necessarily one. This route
 * serves any path inside it — `/p/slug/v0-2` for the entry, or
 * `/p/slug/v0-2/style.css` for anything alongside it — and returns it
 * inline with a content type worked out from its own extension.
 *
 * It goes straight to the content repository by path, without reading the
 * registry. A prototype is routinely a hundred files, and Safari asks for a
 * video in dozens of byte ranges; reading the registry from Blob for every
 * one of those was what rate-limited some of them into failing and then ran
 * the store out altogether. Only a version from before the move to GitHub,
 * whose files are still in Blob, is looked up in the registry.
 *
 * Content served straight from GitHub answers `text/plain` with `nosniff`
 * for everything, which a browser won't execute as a script or apply as a
 * stylesheet — so this always proxies rather than redirecting, and always
 * sets its own content type rather than trusting the one upstream sent.
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
  const { slug, version, path = [] } = await params;
  const relativePath = path.join("/") || "index.html";
  const range = request.headers.get("range");

  const upstream =
    (await fetchPrototypeFile(slug, version, path, range)) ?? (await fromRegistry(slug, version, relativePath, range));
  if (!upstream) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const headers = new Headers({
    "content-type": relativePath === "index.html" ? "text/html; charset=utf-8" : guessContentType(relativePath),
    // A version's files never change, so a whole file is cached hard and
    // forever. A byte range never is: Safari opens a video by asking for its
    // first two bytes, and a cache that kept that answer would hand the
    // same two bytes to every request after it.
    "cache-control": upstream.status === 206 ? "no-store" : "public, max-age=31536000, immutable",
    "accept-ranges": "bytes",
    // Nothing here should end up in a search index.
    "x-robots-tag": "noindex",
  });
  // A tile's preview asks for `?preview`: the page as normal, minus video and
  // audio, which are usually the bulk of what a prototype loads and are no
  // use in a thumbnail. The policy on the page governs everything it loads.
  if (relativePath === "index.html" && new URL(request.url).searchParams.has("preview")) {
    headers.set("content-security-policy", "media-src 'none'");
  }
  // fetch has already decompressed a gzipped body, so its length only
  // holds when upstream sent it uncompressed.
  const passThrough = upstream.headers.get("content-encoding") ? ["content-range"] : ["content-length", "content-range"];
  for (const name of passThrough) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

/** A version pushed before the move to GitHub, whose files are in Blob. */
async function fromRegistry(slug: string, version: string, relativePath: string, range: string | null) {
  const prototype = await getPrototype(slug).catch(() => undefined);
  // Paths use v0-2 rather than v0.2, so a dot never has to be escaped.
  const wanted = version.replace("-", ".");
  const record = prototype?.versions.find((candidate) => candidate.version === wanted);
  if (!record?.fileUrl) return null;

  const targetUrl =
    relativePath === "index.html" ? record.fileUrl : record.fileUrl.replace(/index\.html$/, relativePath);
  const upstream = await fetch(targetUrl, range ? { headers: { range }, cache: "no-store" } : { cache: "no-store" });
  return upstream.ok ? upstream : null;
}
