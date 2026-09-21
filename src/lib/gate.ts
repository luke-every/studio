import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The door.
 *
 * One shared password for the whole studio — not a login. There are no
 * accounts, nothing to remember per person, and no sign-out: you type the
 * word once on a device and the studio opens from then on.
 *
 * The cookie holds a signature of the password rather than the password, so
 * a stolen cookie reveals nothing, and changing the password in Vercel
 * closes every door at once.
 */
const COOKIE = "proto.open";
const MAX_AGE = 60 * 60 * 24 * 365;

function signature(password: string) {
  return createHmac("sha256", password).update("prototype-studio").digest("base64url");
}

function matches(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Whether the studio is open to whoever is asking. */
export async function isUnlocked(): Promise<boolean> {
  const password = process.env.STUDIO_PASSWORD?.trim();
  // No password set means no door — the right behaviour locally.
  if (!password) return true;

  const cookie = (await cookies()).get(COOKIE)?.value;
  return Boolean(cookie && matches(cookie, signature(password)));
}

export async function unlock(attempt: string): Promise<boolean> {
  const password = process.env.STUDIO_PASSWORD?.trim();
  if (!password) return true;
  if (!matches(attempt.trim(), password)) return false;

  (await cookies()).set(COOKIE, signature(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  return true;
}
