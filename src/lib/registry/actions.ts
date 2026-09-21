"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/session";

import * as registry from "./write";

/**
 * Writes.
 *
 * Every one of these is a commit on the team's repository, made with the
 * signed-in person's own GitHub token. Failures are returned rather than
 * thrown, so the interface can say what went wrong without losing what
 * somebody typed.
 *
 * The change is in GitHub immediately; it appears for everyone else once
 * Vercel has finished redeploying, which the interface says plainly rather
 * than pretending to be instant.
 */

export type WriteResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const SIGNED_OUT = "Sign in with GitHub to make changes.";

async function attempt<T>(
  work: (session: NonNullable<Awaited<ReturnType<typeof getSession>>>) => Promise<T>,
  paths: string[],
): Promise<WriteResult<{ value: T }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: SIGNED_OUT };

  try {
    const value = await work(session);
    paths.forEach((path) => revalidatePath(path, "layout"));
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something failed." };
  }
}

export async function createTeam(input: {
  name: string;
  remit: string;
  description: string;
}) {
  return attempt((session) => registry.createTeam(session, input), ["/"]);
}

export async function createProject(input: { teamSlug: string; name: string }) {
  return attempt((session) => registry.createProject(session, input), [
    "/",
    `/teams/${input.teamSlug}`,
  ]);
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}) {
  return attempt((session) => registry.filePrototype(session, input), ["/"]);
}

/** Change the team's current direction. Records who chose it, and when. */
export async function selectDirection(input: {
  prototypeSlug: string;
  explorationId: string;
  versionId: string;
}) {
  return attempt((session) => registry.selectDirection(session, input), [
    "/",
    `/prototypes/${input.prototypeSlug}`,
  ]);
}

/**
 * Adding a prototype by hand, for work that was built somewhere else. The
 * image, if there is one, is committed alongside the record.
 */
export async function createPrototype(form: FormData) {
  const image = form.get("image");
  const hasImage = image instanceof File && image.size > 0;

  return attempt(
    async (session) =>
      registry.createPrototype(session, {
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        designQuestion: String(form.get("designQuestion") ?? ""),
        context: String(form.get("context") ?? ""),
        teamSlug: String(form.get("teamSlug") ?? ""),
        projectSlug: (form.get("projectSlug") as string) || null,
        url: String(form.get("url") ?? ""),
        tint: [
          String(form.get("tintFrom") ?? "#e8e6e1"),
          String(form.get("tintTo") ?? "#8b8880"),
        ],
        image: hasImage
          ? { filename: image.name, bytes: await image.arrayBuffer() }
          : undefined,
      }),
    ["/"],
  );
}
