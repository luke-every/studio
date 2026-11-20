import { NextResponse, type NextRequest } from "next/server";

import { isUnlocked } from "@/lib/gate";
import { userMessage } from "@/lib/registry/errors";
import { workingCopiesOn } from "@/lib/registry/local-prototypes";
import { saveImageExport } from "@/lib/registry/export-images";

/**
 * A picture from another address, for a page that can't read it itself: an image host that doesn't say other pages may read its files (Storyblok's
 * doesn't) can still be shown by the prototype, but not drawn onto a canvas to be scaled. Only pictures come back; anything else is refused.
 */
export async function GET(request: NextRequest) {
  // Exporting is for this machine, where the prototype's folder is: anywhere else this would be a way to have the studio fetch any address.
  if (!workingCopiesOn()) return new NextResponse("Not found.", { status: 404 });
  if (!(await isUnlocked())) return new NextResponse("The studio is locked.", { status: 401 });
  let address: URL;
  try {
    address = new URL(request.nextUrl.searchParams.get("src") ?? "");
  } catch {
    return new NextResponse("Not found.", { status: 404 });
  }
  if (!/^https?:$/.test(address.protocol)) return new NextResponse("Not found.", { status: 404 });
  const upstream = await fetch(address, { cache: "no-store", signal: AbortSignal.timeout(20000) }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !type.startsWith("image/")) return new NextResponse("Not found.", { status: 404 });
  return new NextResponse(upstream.body, { headers: { "content-type": type, "cache-control": "no-store" } });
}

/**
 * A prototype's pictures, made in the browser at the scales asked for, saved in its folder on this machine and shown in Finder (see
 * `registry/export-images.ts`). A plain request rather than a server action: it carries as many files as there are pictures, more than the middleware
 * (which holds a request in memory and cuts it at 10MB) lets through, so the door is checked here.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return new NextResponse("Not found.", { status: 404 });
  if (!(await isUnlocked())) return NextResponse.json({ ok: false, error: "The studio is locked." }, { status: 401 });
  try {
    const form = await request.formData();
    const slug = String(form.get("slug") ?? "");
    const paths = form.getAll("path").map(String);
    const blobs = form.getAll("file");
    if (!paths.length || paths.length !== blobs.length || !blobs.every((one): one is File => one instanceof File)) return NextResponse.json({ ok: false, error: "There is nothing to save." }, { status: 400 });
    const files = await Promise.all(blobs.map(async (blob, index) => ({ path: paths[index], bytes: Buffer.from(await blob.arrayBuffer()) })));
    const folder = await saveImageExport(slug, files);
    return NextResponse.json({ ok: true, folder });
  } catch (error) {
    return NextResponse.json({ ok: false, error: userMessage(error, "The pictures couldn't be saved.") }, { status: 400 });
  }
}
