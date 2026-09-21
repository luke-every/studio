"use server";

import { revalidatePath } from "next/cache";

import { isUnlocked } from "@/lib/gate";

import * as registry from "./write";

/**
 * Writes.
 *
 * Every one of these is a commit on the studio's repository. Failures are
 * returned rather than thrown, so the interface can say what went wrong
 * without losing what somebody typed.
 *
 * The change is in GitHub immediately; it appears for everyone once Vercel
 * has redeployed, which the interface says plainly rather than pretending
 * to be instant.
 */

export type WriteResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

async function attempt<T>(
  work: () => Promise<T>,
  paths: string[],
): Promise<WriteResult<{ value: T }>> {
  if (!(await isUnlocked())) {
    return { ok: false, error: "The studio is locked." };
  }

  try {
    const value = await work();
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
  return attempt(() => registry.createTeam(input), ["/"]);
}

export async function createProject(input: { teamSlug: string; name: string }) {
  return attempt(() => registry.createProject(input), ["/", `/teams/${input.teamSlug}`]);
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}) {
  return attempt(() => registry.filePrototype(input), ["/"]);
}

/** Change the team's current direction. Records who chose it, and when. */
export async function selectDirection(input: {
  prototypeSlug: string;
  explorationId: string;
  versionId: string;
}) {
  return attempt(() => registry.selectDirection(input), [
    "/",
    `/prototypes/${input.prototypeSlug}`,
  ]);
}

/**
 * Adding a prototype by hand, from an HTML file. The file is committed and
 * served from the deployment, so the prototype is actually here.
 */
export async function createPrototype(form: FormData) {
  const file = form.get("html");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an HTML file to upload." };
  }
  if (file.size > 4_000_000) {
    return {
      ok: false as const,
      error: "That file is larger than 4MB. Prototypes this big belong in Claude Code.",
    };
  }

  const bytes = await file.arrayBuffer();

  return attempt(
    () =>
      registry.createPrototype({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        designQuestion: String(form.get("designQuestion") ?? ""),
        teamSlug: String(form.get("teamSlug") ?? ""),
        projectSlug: (form.get("projectSlug") as string) || null,
        by: String(form.get("by") ?? ""),
        tint: [
          String(form.get("tintFrom") ?? "#e8e6e1"),
          String(form.get("tintTo") ?? "#8b8880"),
        ],
        html: { bytes },
      }),
    ["/"],
  );
}
