import "server-only";

import { applyPatch, canvasDocSchema, canvasPatchSchema, IMAGE_DATA, IMAGE_NAME, MAX_IMAGE_CHARS, type CanvasDoc, type CanvasPatch } from "@/lib/canvas-doc";

import { readStudioFile, updateStudioFile, workingCopiesOn, WORKING_VERSION } from "./local-prototypes";
import { isStoreConfigured, readStoreFile, updateStoreFile } from "./store";
import { VERSION_PATTERN, versionSegment } from "./version";

/**
 * Canvases, kept in the cloud: one file per version beside its comments, so a canvas never rewrites the registry or revalidates a page, and is read by the
 * browser through server actions. Read-modify-write like them. A working copy's (v0.0, on this machine) is kept in its own folder instead, as its comments are.
 * Pictures a canvas uses are files of their own, written once.
 */

const working = (version: string) => version === WORKING_VERSION && workingCopiesOn();

const checked = (slug: string) => {
  // These come from the browser and become a path, so they are checked here.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("That isn't a prototype.");
  return slug;
};

function pathFor(slug: string, version: string) {
  if (!VERSION_PATTERN.test(version)) throw new Error("That isn't a prototype version.");
  return `canvas/${checked(slug)}/${versionSegment(version)}.json`;
}

const imagePath = (slug: string, name: string) => {
  if (!IMAGE_NAME.test(name)) throw new Error("That isn't a picture of this canvas.");
  return `canvas/${checked(slug)}/images/${name}.json`;
};

/** The canvas saved for a version; null when none has been. */
export async function readCanvas(slug: string, version: string): Promise<CanvasDoc | null> {
  const path = pathFor(slug, version);
  const text = working(version) ? await readStudioFile(slug, "canvas.json") : await readStoreFile(path);
  if (!text) return null;
  const parsed = canvasDocSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : null;
}

/**
 * Saves what changed, applied to whatever is saved now (read again, and retried if somebody saved first, as every store write is): two people changing
 * different layers keep both changes, and a patch sent twice does no harm. Returns when it was saved.
 */
export async function saveCanvasPatch(slug: string, version: string, patch: CanvasPatch, by?: string) {
  const path = pathFor(slug, version);
  const checked = canvasPatchSchema.parse(patch);
  const savedAt = new Date().toISOString();
  const write = (text: string | null) => {
    const parsed = text ? canvasDocSchema.safeParse(JSON.parse(text)) : null;
    const base = parsed?.success ? parsed.data.canvas : { offsets: {}, pieces: [], frames: [] };
    const canvas = applyPatch(base as { offsets: Record<string, { x: number; y: number }>; pieces: { id: string }[]; frames: { id: string }[]; devices?: string[] }, checked);
    const doc = canvasDocSchema.parse({ savedAt, by: by?.slice(0, 80), canvas });
    const content = JSON.stringify(doc);
    if (content.length > 3_000_000) throw new Error("This canvas is too large to save.");
    return { content, message: `Canvas for ${slug} ${version}` };
  };
  if (working(version)) await updateStudioFile(slug, "canvas.json", write);
  else {
    if (!isStoreConfigured()) throw new Error("No content repository is connected, so nothing can be saved.");
    await updateStoreFile(path, write);
  }
  return savedAt;
}

/** A picture a canvas uses, as a data address; null when there isn't one. */
export async function readCanvasImage(slug: string, name: string) {
  const path = imagePath(slug, name);
  const text = isStoreConfigured() ? await readStoreFile(path) : null;
  return text && IMAGE_DATA.test(text) ? text : null;
}

/** Keeps a picture, once: a name that is already there is left as it is. */
export async function saveCanvasImage(slug: string, name: string, data: string) {
  const path = imagePath(slug, name);
  if (!IMAGE_DATA.test(data) || data.length > MAX_IMAGE_CHARS) throw new Error("That picture can't be kept.");
  if (!isStoreConfigured()) throw new Error("No content repository is connected, so nothing can be saved.");
  await updateStoreFile(path, (text) => ({ content: text ?? data, message: `Picture ${name} for ${slug}` }));
}
