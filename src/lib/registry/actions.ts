"use server";

import { revalidatePath } from "next/cache";

import { isUnlocked } from "@/lib/gate";
import { mintReviewToken } from "@/lib/review";
import { LATEST, mintShareToken, resolveShareToken } from "@/lib/share";

import { EDIT_IMAGE_DIR, editsSchema, type Edit } from "@/lib/edits";

import * as activity from "./activity";
import * as canvases from "./canvas";
import * as comments from "./comments";
import * as copyDocs from "./copy-docs";
import * as designQa from "./design-qa";
import * as system from "./design-system";
import * as handoff from "./handoff";
import * as liveEdits from "./live-edits";
import * as push from "./push";
import * as registry from "./write";
import { IMAGE_MAX_BYTES } from "@/lib/image";
import { userMessage } from "./errors";

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
    return { ok: false, error: userMessage(error) };
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

export async function deletePrototype(input: Parameters<typeof registry.deletePrototype>[0]) {
  return attempt(() => registry.deletePrototype(input), ["/"]);
}

export async function deleteVersion(input: Parameters<typeof registry.deleteVersion>[0]) {
  return attempt(() => registry.deleteVersion(input), ["/"]);
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
  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false as const, error: "That file is larger than 4MB." };
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
    if (value.size > IMAGE_MAX_BYTES) return { ok: false as const, error: "Images can be up to 4MB each." };
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

/** A link that opens without the password, for sharing outside the studio. It follows the latest version, or with `key` (the version it is stored under, v2.0) stays on that one. */
export async function shareLink(slug: string, key?: string) {
  return attempt(async () => `/s/${mintShareToken(slug, key ?? LATEST)}`, []);
}

/**
 * What somebody with a share link may do to the comments on that one version:
 * read them, add one, reply, like. The token names the prototype and the
 * version, so none of these can reach anything else, and none needs the door.
 * Resolving and deleting stay with the studio.
 */
async function shared<T>(token: string, work: (at: { slug: string; version: string }) => Promise<T>): Promise<WriteResult<{ value: T }>> {
  const named = await resolveShareToken(token);
  if (!named) return { ok: false, error: "This share link isn't valid." };
  try {
    return { ok: true, value: await work({ slug: named.slug, version: named.key }) };
  } catch (error) {
    return { ok: false, error: userMessage(error) };
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

/** A version's canvas: where its screens, frames and layers were put. Saved by the studio, read by the studio and, view only, by a share link. */
export async function loadCanvas(slug: string, version: string) {
  return attempt(() => canvases.readCanvas(slug, version), []);
}

/** What changed on a canvas since the cloud's copy (see `canvas-doc.ts`), merged into what is saved. */
export async function patchCanvas(slug: string, version: string, patch: Parameters<typeof canvases.saveCanvasPatch>[2], by?: string) {
  return attempt(() => canvases.saveCanvasPatch(slug, version, patch, by), []);
}

export async function loadCanvasImage(slug: string, name: string) {
  return attempt(() => canvases.readCanvasImage(slug, name), []);
}

export async function storeCanvasImage(slug: string, name: string, data: string) {
  return attempt(() => canvases.saveCanvasImage(slug, name, data), []);
}

/** The canvas a share link opens on, and its pictures: read only, and only of the version the link names. */
export async function loadSharedCanvas(token: string) {
  return shared(token, (at) => canvases.readCanvas(at.slug, at.version));
}

export async function loadSharedCanvasImage(token: string, name: string) {
  return shared(token, (at) => canvases.readCanvasImage(at.slug, name));
}

export async function likeComment(input: Parameters<typeof comments.setLiked>[0]) {
  return attempt(() => comments.setLiked(input), []);
}

/** A live version's design-system components, and when one is named, its props (see `design-system.ts`). */
export async function designSystemOf(slug: string, name?: string) {
  return attempt(() => system.designSystem(slug, name), []);
}

/** A version's colour tokens, from its design system's stylesheet (see `designTokens`). */
export async function designTokensOf(slug: string) {
  return attempt(() => system.designTokens(slug), []);
}

/**
 * A version's handoff (see `handoff.ts`), and the designer's decisions on it. Read by the browser, like comments, so the
 * page stays prerendered; nothing prerendered shows it, so nothing is revalidated. `key` is the version's stored key.
 */
export async function readHandoff(slug: string, key: string) {
  return attempt(() => handoff.readHandoff(slug, key), []);
}

export async function handoffPublicOf(slug: string, key: string) {
  return attempt(() => handoff.handoffPublic(slug, key), []);
}

export async function handoffStatusOf(slug: string, key: string) {
  return attempt(() => handoff.handoffStatus(slug, key), []);
}

export async function decideFinding(input: Parameters<typeof handoff.decide>[0]) {
  return attempt(() => handoff.decide(input), []);
}

/** A component marked as new on the canvas, or taken off again (see `markComponent`). */
export async function markHandoffComponent(input: Parameters<typeof handoff.markComponent>[0]) {
  return attempt(() => handoff.markComponent(input), []);
}

export async function unmarkHandoffComponent(input: Parameters<typeof handoff.unmarkComponent>[0]) {
  return attempt(() => handoff.unmarkComponent(input), []);
}

export async function signOffHandoff(input: Parameters<typeof handoff.signOff>[0]) {
  return attempt(() => handoff.signOff(input), []);
}

/** Does what the decisions say that a script can, in the prototype's code on this machine; and takes it back. */
export async function applyHandoffDecisions(input: Parameters<typeof handoff.applyHandoff>[0]) {
  return attempt(() => handoff.applyHandoff(input), []);
}

export async function undoHandoffDecisions(input: Parameters<typeof handoff.undoHandoffApply>[0]) {
  return attempt(() => handoff.undoHandoffApply(input), []);
}

/** Writes the edits made on a live version into its source, on this machine (see `live-edits.ts`). Pictures arrive as files named by the path their edit uses. */
export async function saveLiveEdits(form: FormData) {
  let edits: Edit[];
  try {
    edits = editsSchema.parse(JSON.parse(String(form.get("edits") ?? "[]")));
  } catch {
    return { ok: false as const, error: "Those edits couldn't be read." };
  }
  const uploads = new Map<string, liveEdits.Upload>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith(`${EDIT_IMAGE_DIR}/`) || !(value instanceof File)) continue;
    if (!/^_edits\/[\w.-]+$/.test(key)) return { ok: false as const, error: "That image has an odd name." };
    if (value.size > IMAGE_MAX_BYTES) return { ok: false as const, error: "Images can be up to 4MB each." };
    uploads.set(key, { name: value.name, bytes: Buffer.from(await value.arrayBuffer()) });
  }
  return attempt(() => liveEdits.saveLiveEdits(String(form.get("slug") ?? ""), edits, uploads), []);
}

/** Puts back what Claude changed for one of its replies on a live version, or makes the change again. */
export async function undoClaudeChange(input: Parameters<typeof comments.undoClaudeChange>[0]) {
  return attempt(() => comments.undoClaudeChange(input), []);
}

export async function deleteComment(input: Parameters<typeof comments.removeComment>[0]) {
  return attempt(() => comments.removeComment(input), []);
}

export async function editNote(input: Parameters<typeof comments.setNoteText>[0]) {
  return attempt(() => comments.setNoteText(input), []);
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

/** Design QA, on this machine only (see `design-qa.ts`). */
export async function listQaBranches() {
  return attempt(() => designQa.listBranches(), []);
}
export async function listQaItems() {
  return attempt(() => designQa.listItems(), []);
}
export async function newQaItem(branch: string) {
  return attempt(() => designQa.createItem(branch), []);
}
export async function startQaItem(id: string) {
  return attempt(() => designQa.startItem(id), []);
}
export async function stopQaItem(id: string) {
  return attempt(() => designQa.stopItem(id), []);
}
export async function archiveQaItem(id: string, archived: boolean) {
  return attempt(() => designQa.archiveItem(id, archived), []);
}
export async function discardQaItem(id: string) {
  return attempt(() => designQa.discardFailed(id), []);
}
export async function openQaInITerm(id: string) {
  return attempt(() => designQa.openInITerm(id), []);
}
export async function revealQaFolder(id: string) {
  return attempt(() => designQa.revealItem(id), []);
}

/** A prototype's copy documents, made on this machine only (see `copy-docs.ts`). */
export async function readCopyDocs(slug: string) {
  return attempt(() => copyDocs.readCopyDocs(slug), []);
}
export async function createCopyDoc(slug: string, name: string, kind: copyDocs.CopyKind, notionUrl?: string, keys?: string[]) {
  return attempt(() => copyDocs.createCopyDoc(slug, name, kind, notionUrl, keys), []);
}
export async function readCopySections(slug: string) {
  return attempt(() => copyDocs.readCopySections(slug), []);
}
export async function linkCopyDoc(slug: string, name: string, kind: copyDocs.CopyKind, url: string) {
  return attempt(() => copyDocs.linkCopyDoc(slug, name, kind, url), []);
}
export async function deleteCopyDoc(slug: string, kind: copyDocs.CopyKind) {
  return attempt(() => copyDocs.deleteCopyDoc(slug, kind), []);
}
export async function forgetCopyDoc(slug: string, kind: copyDocs.CopyKind) {
  return attempt(() => copyDocs.forgetCopyDoc(slug, kind), []);
}
export async function clearCopyDocsTask(slug: string, kind: copyDocs.CopyKind) {
  return attempt(() => copyDocs.clearCopyDocsTask(slug, kind), []);
}
export async function previewCopyImport(slug: string, rows: Parameters<typeof copyDocs.previewCopyImport>[1]) {
  return attempt(() => copyDocs.previewCopyImport(slug, rows), []);
}
export async function applyCopyImport(slug: string, changes: Parameters<typeof copyDocs.applyCopyImport>[1]) {
  return attempt(() => copyDocs.applyCopyImport(slug, changes), []);
}
export async function previewClaudeUpdate(slug: string) {
  return attempt(() => copyDocs.previewClaudeUpdate(slug), []);
}
export async function updateClaudeDoc(slug: string, keys: string[]) {
  return attempt(() => copyDocs.updateClaudeDoc(slug, keys), []);
}
export async function retryCopyDocDelete(slug: string, kind: copyDocs.CopyKind) {
  return attempt(() => copyDocs.retryCopyDocDelete(slug, kind), []);
}
export async function dismissCopyDocDelete(slug: string, kind: copyDocs.CopyKind) {
  return attempt(() => copyDocs.dismissCopyDocDelete(slug, kind), []);
}
export async function pullCopyFromDoc(slug: string) {
  return attempt(() => copyDocs.pullClaudeDoc(slug), []);
}
