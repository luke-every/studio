import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cookies } from "next/headers";
import { z } from "zod";

/**
 * Where the studio writes.
 *
 * Resolved in order, most specific first:
 *
 *   1. a cookie, set by whoever is currently setting the studio up — this is
 *      what breaks the bootstrap: the repository can be named in the app
 *      before there is anywhere to save the fact that it was named
 *   2. registry/settings.json, committed, so it applies to everyone
 *   3. the Vercel deployment, which already knows its own repository
 *
 * Nothing here needs to be set by hand in the normal case: deploy on Vercel
 * and step 3 answers it.
 */

export const studioSettingsSchema = z.object({
  /** owner/name */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "must look like owner/name"),
  branch: z.string().min(1).default("main"),
});

export type StudioSettings = z.infer<typeof studioSettingsSchema>;

export type ResolvedSettings = {
  repo: string | null;
  branch: string;
  source: "cookie" | "registry" | "vercel" | "unset";
};

const SETTINGS_COOKIE = "proto.studio";
const SETTINGS_PATH = "registry/settings.json";

async function fromFile(): Promise<StudioSettings | null> {
  try {
    const text = await readFile(join(process.cwd(), SETTINGS_PATH), "utf8");
    return studioSettingsSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

async function fromCookie(): Promise<StudioSettings | null> {
  const value = (await cookies()).get(SETTINGS_COOKIE)?.value;
  if (!value) return null;
  try {
    return studioSettingsSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

function fromVercel(): StudioSettings | null {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  if (!owner || !slug) return null;
  return {
    repo: `${owner}/${slug}`,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "main",
  };
}

export async function getSettings(): Promise<ResolvedSettings> {
  const cookie = await fromCookie();
  if (cookie) return { ...cookie, source: "cookie" };

  const file = await fromFile();
  if (file) return { ...file, source: "registry" };

  const vercel = fromVercel();
  if (vercel) return { ...vercel, source: "vercel" };

  return { repo: null, branch: "main", source: "unset" };
}

/** Remember a setting for this person before it can be committed for everyone. */
export async function rememberSettings(settings: StudioSettings) {
  (await cookies()).set(SETTINGS_COOKIE, JSON.stringify(settings), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function forgetSettings() {
  (await cookies()).delete(SETTINGS_COOKIE);
}

export const SETTINGS_FILE_PATH = SETTINGS_PATH;
