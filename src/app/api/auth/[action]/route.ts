import { NextResponse, type NextRequest } from "next/server";

import { readAuthConfig } from "@/lib/auth/config";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Sign in with GitHub.
 *
 * Deliberately small and hand-written: an authorize redirect, a callback
 * that exchanges the code for the person's own access token, and a sign-out.
 * The token is sealed into their session cookie and used for the commits the
 * studio makes on their behalf.
 *
 * Scope is `repo` because writing the registry means committing to the
 * repository. Nothing broader is requested.
 */
const SCOPE = "repo read:user";

function origin(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  const config = readAuthConfig();

  if (action === "signout") {
    await clearSession();
    return NextResponse.redirect(new URL("/", origin(request)));
  }

  if (!config) {
    return NextResponse.redirect(new URL("/settings?problem=not-configured", origin(request)));
  }

  if (action === "signin") {
    const next = request.nextUrl.searchParams.get("next") ?? "/";
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", config.clientId);
    authorize.searchParams.set("scope", SCOPE);
    authorize.searchParams.set("redirect_uri", `${origin(request)}/api/auth/callback`);
    authorize.searchParams.set("state", encodeURIComponent(next));
    return NextResponse.redirect(authorize);
  }

  if (action === "callback") {
    const code = request.nextUrl.searchParams.get("code");
    const next = decodeURIComponent(request.nextUrl.searchParams.get("state") ?? "/");
    if (!code) {
      return NextResponse.redirect(new URL("/settings?problem=no-code", origin(request)));
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: `${origin(request)}/api/auth/callback`,
      }),
    });

    const token = (await tokenResponse.json()) as { access_token?: string; error?: string };
    if (!token.access_token) {
      return NextResponse.redirect(
        new URL(`/settings?problem=${token.error ?? "no-token"}`, origin(request)),
      );
    }

    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${token.access_token}`,
        accept: "application/vnd.github+json",
      },
    });
    const profile = (await profileResponse.json()) as {
      login?: string;
      name?: string | null;
      avatar_url?: string;
    };

    if (!profile.login) {
      return NextResponse.redirect(new URL("/settings?problem=no-profile", origin(request)));
    }

    await setSession({
      login: profile.login,
      // Plenty of GitHub accounts have no display name set.
      name: profile.name?.trim() || profile.login,
      avatarUrl: profile.avatar_url ?? "",
      token: token.access_token,
    });

    return NextResponse.redirect(new URL(next, origin(request)));
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 404 });
}
