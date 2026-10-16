"use server";

import { revalidatePath } from "next/cache";

import { isUnlocked } from "@/lib/gate";
import { mintReviewToken } from "@/lib/review";
import { mintShareToken, readShareToken } from "@/lib/share";

import { EDIT_IMAGE_DIR, editsSchema, type Edit } from "@/lib/edits";

import * as activity from "./activity";
import * as comments from "./comments";
import * as push from "./push";
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

/**
 * Saving visual edits as a new version. The edits arrive as JSON, and each
 * replaced image as a file named by the path it will be kept at.
 */
export async function saveEdits(form: FormData) {
  const images: { path: string; content: ArrayBuffer }[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith(`${EDIT_IMAGE_DIR}/`) || !(value instanceof File)) continue;
    if (!/^_edits\/[\w.-]+$/.test(key)) return { ok: false as const, error: "That image has an odd name." };
    if (value.size > 4_000_000) return { ok: false as const, error: "Images can be up to 4MB each." };
    images.push({ path: key, content: await value.arrayBuffer() });
  }

  const slug = String(form.get("slug") ?? "");
  let edits: Edit[];
  try {
    edits = editsSchema.parse(JSON.parse(String(form.get("edits") ?? "[]")));
  } catch {
    return { ok: false as const, error: "Those edits couldn't be read." };
  }

  return attempt(
    () =>
      registry.saveEditedVersion({
        slug,
        baseVersionId: String(form.get("baseVersionId") ?? ""),
        edits,
        images,
        by: String(form.get("by") ?? ""),
        variant: form.get("variantLabel")
          ? {
              id: String(form.get("variantId") ?? ""),
              label: String(form.get("variantLabel")).slice(0, 60),
              basedOn: String(form.get("variantBasedOn") ?? "") || undefined,
            }
          : undefined,
      }),
    ["/"],
  );
}

/** Comments on one version of a prototype. They are not in any prerendered page, so nothing is revalidated. */
export async function listComments(slug: string, version: string) {
  return attempt(() => comments.readComments(slug, version), []);
}

export async function addComment(input: Parameters<typeof comments.addComment>[0]) {
  return attempt(() => comments.addComment(input), []);
}

/** A review link's token for a version, for the QR code: a phone that scans it can leave comments. `version` is the folder form (v0-2). */
export async function reviewToken(slug: string, version: string) {
  return attempt(async () => mintReviewToken(slug, version), []);
}

/** A link to one version that opens without the password, for sharing outside the studio. `key` is the version it is stored under (v2.0). */
export async function shareLink(slug: string, key: string) {
  return attempt(async () => `/s/${mintShareToken(slug, key)}`, []);
}

/**
 * What somebody with a share link may do to the comments on that one version:
 * read them, add one, reply, like. The token names the prototype and the
 * version, so none of these can reach anything else, and none needs the door.
 * Resolving and deleting stay with the studio.
 */
async function shared<T>(token: string, work: (at: { slug: string; version: string }) => Promise<T>): Promise<WriteResult<{ value: T }>> {
  const named = readShareToken(token);
  if (!named) return { ok: false, error: "This share link isn't valid." };
  try {
    return { ok: true, value: await work({ slug: named.slug, version: named.key }) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Something failed." };
  }
}

export async function listSharedComments(token: string) {
  return shared(token, (at) => comments.readComments(at.slug, at.version));
}

export async function addSharedComment(token: string, input: Omit<Parameters<typeof comments.addComment>[0], "slug" | "version">) {
  return shared(token, (at) => comments.addComment({ ...input, ...at }));
}

export async function likeSharedComment(token: string, input: Omit<Parameters<typeof comments.setLiked>[0], "slug" | "version">) {
  return shared(token, (at) => comments.setLiked({ ...input, ...at }));
}

export async function likeComment(input: Parameters<typeof comments.setLiked>[0]) {
  return attempt(() => comments.setLiked(input), []);
}

export async function setCommentScreen(input: Parameters<typeof comments.setFlowScreen>[0]) {
  return attempt(() => comments.setFlowScreen(input), []);
}

export async function deleteComment(input: Parameters<typeof comments.removeComment>[0]) {
  return attempt(() => comments.removeComment(input), []);
}

export async function resolveComment(input: Parameters<typeof comments.setResolved>[0]) {
  return attempt(() => comments.setResolved(input), []);
}

/**
 * The studio's password, for the setup guide to show to someone already inside.
 * It is asked for rather than written into the page, so it stays out of the code
 * that is sent to everyone and follows the password if it changes.
 */
export async function studioPassword() {
  if (!(await isUnlocked())) return "";
  return process.env.STUDIO_PASSWORD?.trim() ?? "";
}

/** What a browser needs to subscribe this device to notifications. */
export async function pushKey() {
  return attempt(async () => push.pushPublicKey(), []);
}

export async function enablePush(subscription: unknown, name: string) {
  return attempt(() => push.addDevice(subscription, name), []);
}

export async function disablePush(endpoint: string) {
  return attempt(() => push.removeDevice(endpoint), []);
}

/** The latest comments across the studio, for the bell. */
export async function listActivity() {
  return attempt(() => activity.readActivity(), []);
}

/** Sends this device a test notification, so a refusal can be seen. */
export async function testPush(endpoint: string) {
  return attempt(() => push.sendTest(endpoint), []);
}
