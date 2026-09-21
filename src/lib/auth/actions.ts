"use server";

import { revalidatePath } from "next/cache";

import {
  SETTINGS_FILE_PATH,
  forgetSettings,
  getSettings,
  rememberSettings,
  studioSettingsSchema,
} from "@/lib/registry/settings";
import { writeFile } from "@/lib/registry/github";

import { clearSession, getSession, identify, setSession } from "./session";

/**
 * Connecting, and configuring the studio — entirely from inside the app.
 *
 * There is nothing to set in a file or an environment variable: a person
 * pastes their own GitHub token, the studio asks GitHub who it belongs to,
 * and that is the whole of signing in.
 */

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function connectGitHub(formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { ok: false, error: "Paste a token first." };

  const viewer = await identify(token);
  if (!viewer) {
    return {
      ok: false,
      error: "GitHub did not accept that token. Check it was copied whole and has not expired.",
    };
  }

  await setSession(token, viewer);
  revalidatePath("/", "layout");
  return { ok: true, message: `Connected as ${viewer.name}.` };
}

export async function disconnectGitHub(): Promise<ActionResult> {
  await clearSession();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Point the studio at a repository.
 *
 * Remembered for this person straight away, so the setting can be used
 * before there is anywhere to save it, and committed to the registry so it
 * applies to everyone. The commit is best-effort: naming the repository has
 * to work even when the studio cannot yet write to it.
 */
export async function saveStudioSettings(formData: FormData): Promise<ActionResult> {
  const parsed = studioSettingsSchema.safeParse({
    repo: String(formData.get("repo") ?? "").trim(),
    branch: String(formData.get("branch") ?? "main").trim() || "main",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That does not look right." };
  }

  await rememberSettings(parsed.data);

  const session = await getSession();
  if (!session) {
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved for you. Connect GitHub to save it for everyone." };
  }

  try {
    await writeFile(session, "registry: set the studio repository", {
      path: SETTINGS_FILE_PATH,
      content: `${JSON.stringify(parsed.data, null, 2)}\n`,
      sha: await currentSha(session, SETTINGS_FILE_PATH),
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved for everyone." };
  } catch (error) {
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Saved for you, but not for everyone yet: ${
        error instanceof Error ? error.message : "the commit failed"
      }`,
    };
  }
}

async function currentSha(session: Awaited<ReturnType<typeof getSession>>, path: string) {
  if (!session) return undefined;
  const { readFile } = await import("@/lib/registry/github");
  const existing = await readFile(session, path).catch(() => null);
  return existing?.sha;
}

export async function resetStudioSettings(): Promise<ActionResult> {
  await forgetSettings();
  revalidatePath("/", "layout");
  const settings = await getSettings();
  return {
    ok: true,
    message: settings.repo
      ? `Back to ${settings.repo}.`
      : "Cleared. No repository is set.",
  };
}
