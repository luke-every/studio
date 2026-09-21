import { NextResponse, type NextRequest } from "next/server";

/**
 * Keep the door shut.
 *
 * The check itself lives in lib/gate; this only decides who gets sent to it.
 * Middleware runs on the edge without Node crypto, so it looks for the
 * cookie's presence and leaves verifying it to the pages, which do have the
 * password to compare against.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const exempt =
    pathname === "/unlock" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/p/") ||
    pathname === "/favicon.ico";

  if (exempt) return NextResponse.next();

  const locked = Boolean(process.env.STUDIO_PASSWORD?.trim());
  const hasCookie = request.cookies.has("proto.open");

  if (locked && !hasCookie) {
    return NextResponse.redirect(new URL("/unlock", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
