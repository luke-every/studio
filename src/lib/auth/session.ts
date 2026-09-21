import "server-only";

import { cookies } from "next/headers";

/**
 * Who is signed in.
 *
 * A person connects their own GitHub account by pasting a personal access
 * token, which is held in an httpOnly cookie. No OAuth app, so there is
 * nothing to register and no client secret — which is what lets the entire
 * setup happen inside the studio rather than in environment variables.
 *
 * The cookie is not encrypted, deliberately: the token *is* the credential,
 * so sealing it would protect against nothing that stealing the cookie does
 * not already defeat. What matters is that the display name in the cookie is
 * never trusted for attribution — every write re-reads the identity from
 * GitHub using the token itself, so nobody can commit under someone else's
 * name by editing their own cookie.
 */
export type Session = {
  token: string;
  /** Display only. Verified against GitHub before anything is written. */
  login: string;
  name: string;
  avatarUrl: string;
};

const TOKEN_COOKIE = "proto.token";
const PROFILE_COOKIE = "proto.profile";
const MAX_AGE = 60 * 60 * 24 * 90;

export type Viewer = Omit<Session, "token">;

/** Ask GitHub who a token belongs to. The only source of identity. */
export async function identify(token: string): Promise<Viewer | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
    },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const profile = (await response.json()) as {
    login?: string;
    name?: string | null;
    avatar_url?: string;
  };
  if (!profile.login) return null;

  return {
    login: profile.login,
    // Plenty of GitHub accounts have no display name set.
    name: profile.name?.trim() || profile.login,
    avatarUrl: profile.avatar_url ?? "",
  };
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  if (!token) return null;

  const profile = store.get(PROFILE_COOKIE)?.value;
  let viewer: Viewer = { login: "unknown", name: "Signed in", avatarUrl: "" };
  if (profile) {
    try {
      viewer = JSON.parse(Buffer.from(profile, "base64url").toString("utf8")) as Viewer;
    } catch {
      // Unreadable profile: the token still works, the label is just generic.
    }
  }

  return { token, ...viewer };
}

/** The identity GitHub confirms for this token, not the one in the cookie. */
export async function getVerifiedSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;

  const viewer = await identify(session.token);
  if (!viewer) return null;

  return { token: session.token, ...viewer };
}

export async function setSession(token: string, viewer: Viewer) {
  const store = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  };

  store.set(TOKEN_COOKIE, token, options);
  store.set(
    PROFILE_COOKIE,
    Buffer.from(JSON.stringify(viewer), "utf8").toString("base64url"),
    options,
  );
}

export async function clearSession() {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(PROFILE_COOKIE);
}

export function toViewer(session: Session): Viewer {
  return { login: session.login, name: session.name, avatarUrl: session.avatarUrl };
}
