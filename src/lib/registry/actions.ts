"use server";

import { revalidatePath } from "next/cache";

import { isUnlocked } from "@/lib/gate";

import * as registry from "./write";

/**
 * Writes.
 *
 * Every one of these writes to the store and revalidates, so the change is
 * live for everyone within seconds — nothing is rebuilt and nothing is
 * redeployed. Failures are returned rather than thrown, so the interface can
 * say what went wrong without losing what somebody typed.
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

export async function updatePrototype(input: Parameters<typeof registry.updatePrototype>[0]) {
  return attempt(() => registry.updatePrototype(input), ["/"]);
}

export async function renameVersion(input: Parameters<typeof registry.renameVersion>[0]) {
  return attempt(() => registry.renameVersion(input), ["/"]);
}

/**
 * Adding a prototype by hand, from an HTML file. The file is uploaded to the
 * store and served from there, so the prototype is genuinely here — and
 * nothing is redeployed to make it appear.
 */
export async function createPrototype(form: FormData) {
  const file = form.get("html");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "Choose an HTML file to upload." };
  }
  if (file.size > 8_000_000) {
    return { ok: false as const, error: "That file is larger than 8MB." };
  }

  const bytes = await file.arrayBuffer();

  return attempt(
    () =>
      registry.saveVersion({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? ""),
        changes: String(form.get("changes") ?? ""),
        teamSlug: String(form.get("teamSlug") ?? ""),
        projectSlug: (form.get("projectSlug") as string) || null,
        by: String(form.get("by") ?? ""),
        html: bytes,
      }),
    ["/"],
  );
}
