import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { readAuthConfig } from "./config";

/**
 * The signed-in person.
 *
 * Identity comes from GitHub — there are no accounts to manage here. The
 * session is the person's own GitHub access token plus their profile, sealed
 * into a cookie. The token is theirs, so the commits the studio makes on
 * their behalf are genuinely theirs, and there is no shared secret with
 * write access to the repository sitting in an environment variable.
 */
export type Session = {
  login: string;
  name: string;
  avatarUrl: string;
  token: string;
};

const COOKIE = "proto.session";
const MAX_AGE = 60 * 60 * 24 * 30;

/**
 * The cookie key is derived from the OAuth client secret rather than being
 * a third thing to configure. It never leaves the server, and rotating the
 * secret simply signs everyone out.
 */
function key(): Buffer | null {
  const config = readAuthConfig();
  if (!config) return null;
  return createHash("sha256").update(config.clientSecret).digest();
}

export function seal(session: Session): string | null {
  const secret = key();
  if (!secret) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(session), "utf8"),
    cipher.final(),
  ]);

  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

export function unseal(value: string): Session | null {
  const secret = key();
  if (!secret) return null;

  try {
    const [iv, tag, body] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !body) return null;

    const decipher = createDecipheriv("aes-256-gcm", secret, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    return JSON.parse(json) as Session;
  } catch {
    // Tampered, or the client secret has changed. Either way: not signed in.
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookie = (await cookies()).get(COOKIE);
  return cookie ? unseal(cookie.value) : null;
}

export async function setSession(session: Session) {
  const sealed = seal(session);
  if (!sealed) return;

  (await cookies()).set(COOKIE, sealed, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** The session without the token — safe to hand to the browser. */
export type Viewer = Omit<Session, "token">;

export function toViewer(session: Session): Viewer {
  return { login: session.login, name: session.name, avatarUrl: session.avatarUrl };
}
