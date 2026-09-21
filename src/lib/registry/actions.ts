"use server";

import { revalidatePath } from "next/cache";

import { getStore } from "./get-store";

/**
 * Writes.
 *
 * Server actions rather than an API route: the client calls a function, the
 * store decides what that means, and the affected pages revalidate so every
 * other person sees the change on their next load. Failures are returned
 * rather than thrown, because the interface has to be able to say what went
 * wrong without losing what the person typed.
 */

export type WriteResult = { ok: true } | { ok: false; error: string };

function slugify(name: string, fallback: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `${fallback}-${Date.now()}`;
}

async function attempt(work: () => Promise<void>, paths: string[]): Promise<WriteResult> {
  try {
    await work();
    paths.forEach((path) => revalidatePath(path, "layout"));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something failed." };
  }
}

export async function createTeam(input: {
  name: string;
  remit: string;
  description: string;
  by: string;
}): Promise<WriteResult & { slug?: string }> {
  const slug = slugify(input.name, "team");
  const result = await attempt(
    () =>
      getStore().createTeam({
        slug,
        name: input.name.trim(),
        remit: input.remit.trim(),
        description: input.description.trim(),
        by: input.by,
      }),
    ["/"],
  );
  return result.ok ? { ...result, slug } : result;
}

export async function createProject(input: {
  teamSlug: string;
  name: string;
  by: string;
}): Promise<WriteResult & { slug?: string }> {
  const slug = slugify(input.name, "project");
  const result = await attempt(
    () =>
      getStore().createProject({
        slug,
        teamSlug: input.teamSlug,
        name: input.name.trim(),
        by: input.by,
      }),
    ["/", `/teams/${input.teamSlug}`],
  );
  return result.ok ? { ...result, slug } : result;
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}): Promise<WriteResult> {
  return attempt(() => getStore().filePrototype(input), ["/"]);
}

/** Change the team's current direction. Records who chose it, and when. */
export async function selectDirection(input: {
  prototypeSlug: string;
  explorationId: string;
  versionId: string;
  by: string;
}): Promise<WriteResult> {
  return attempt(() => getStore().selectDirection(input), ["/", `/prototypes/${input.prototypeSlug}`]);
}
