import { NextResponse, type NextRequest } from "next/server";

/**
 * The door, checked here and only here.
 *
 * This used to be verified in the root layout as well, which meant every
 * page read a cookie — and a page that reads a cookie cannot be
 * prerendered. With a password set in production that quietly turned the
 * whole studio dynamic: every navigation became a server round trip, which
 * is exactly the delay it felt like.
 *
 * Middleware runs before the page and has no such cost, so the check lives
 * here and the pages stay static. Web Crypto rather than node:crypto,
 * because middleware runs on the edge runtime.
 */

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer) {
  return Buffer.from(bytes).toString("base64url");
}

/** Must match the signature written by lib/gate. */
async function signature(password: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode("prototype-studio")));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const exempt =
    pathname === "/unlock" ||
    // Prototypes are deliberately outside the door, and the API carries
    // the password itself rather than a cookie.
    pathname.startsWith("/p/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts/") ||
    // The installer and the skill files it fetches, run from a terminal.
    pathname === "/install.sh" ||
    pathname.startsWith("/skill/") ||
    pathname === "/favicon.ico";

  if (exempt) return NextResponse.next();

  const password = process.env.STUDIO_PASSWORD?.trim();
  if (!password) return NextResponse.next();

  const cookie = request.cookies.get("proto.open")?.value;
  if (cookie && cookie === (await signature(password))) return NextResponse.next();

  return NextResponse.redirect(new URL("/unlock", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
