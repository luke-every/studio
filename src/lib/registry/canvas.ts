import "server-only";

import { createHash } from "node:crypto";

import { STICKY_COLORS } from "@/lib/canvas-saved";
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
export async function saveCanvasPatch(slug: string, version: string, patch: CanvasPatch, by?: string, restrict?: (saved: { frames: { id: string }[] }, patch: CanvasPatch) => CanvasPatch) {
  const path = pathFor(slug, version);
  const checked = canvasPatchSchema.parse(patch);
  const savedAt = new Date().toISOString();
  const write = (text: string | null) => {
    const parsed = text ? canvasDocSchema.safeParse(JSON.parse(text)) : null;
    const base = parsed?.success ? parsed.data.canvas : { offsets: {}, pieces: [], frames: [] };
    const canvas = applyPatch(base as { offsets: Record<string, { x: number; y: number }>; pieces: { id: string }[]; frames: { id: string }[]; devices?: string[] }, restrict ? restrict(base as unknown as { frames: { id: string }[] }, checked) : checked);
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

/**
 * What somebody with a share link may put on a canvas: sticky notes of their own, and nothing else. Their browser holds a secret id it never
 * shows anybody; the canvas keeps only a hash of it on each note it made (`owner`), so a note can be changed, moved or taken away only by
 * the browser that made it, and nobody who reads the canvas can copy the id. Anything else in a patch (another frame, a piece, a device, the
 * stacking order) is dropped, and a note is rebuilt from the few fields a note has, so a patch can't carry anything else in.
 */
const STICKY_ID = /^[a-z0-9-]{3,40}$/i;
const MOST_STICKIES = 50;
/** Every browser's together: an id is made up by the browser, so a limit on each alone could be got round with more of them. */
const MOST_STICKIES_ALL = 300;
const MOST_PER_SAVE = 20;
const SECRET = /^[A-Za-z0-9-]{16,64}$/;

const within = (value: unknown, least: number, most: number) => (typeof value === "number" && Number.isFinite(value) && value >= least && value <= most ? value : undefined);
const words = (value: unknown, most: number) => (typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, most) : undefined);

function stickyFrom(id: string, raw: Record<string, unknown>, owner: string) {
  const [x, y] = [within(raw.x, -1_000_000, 1_000_000), within(raw.y, -1_000_000, 1_000_000)];
  const [width, height] = [within(raw.width, 24, 1200), within(raw.height, 24, 4000)];
  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;
  const fill = typeof raw.fill === "string" && STICKY_COLORS.some((one) => one.color.toLowerCase() === (raw.fill as string).toLowerCase()) ? raw.fill : STICKY_COLORS[0].color;
  return {
    id,
    shape: "sticky",
    name: words(raw.name, 60) || "Sticky note",
    x,
    y,
    width,
    height,
    fill,
    radius: within(raw.radius, 0, 32) ?? 4,
    text: words(raw.text, 600) ?? "",
    author: words(raw.author, 80) || undefined,
    base: within(raw.base, 24, 1200) ?? Math.min(width, height),
    owner,
  };
}

export function onlyTheirStickies(owner: string) {
  return (saved: { frames: { id: string }[] }, patch: CanvasPatch): CanvasPatch => {
    const frames = saved.frames as { id: string; shape?: string; owner?: string }[];
    const known = new Map(frames.map((frame) => [frame.id, frame]));
    const theirs = (id: string) => {
      const frame = known.get(id);
      return !!frame && frame.shape === "sticky" && frame.owner === owner;
    };
    let count = frames.filter((frame) => frame.shape === "sticky" && frame.owner === owner).length;
    let everyone = frames.filter((frame) => frame.shape === "sticky" && frame.owner).length;
    const set: Record<string, Record<string, unknown>> = {};
    for (const [id, raw] of Object.entries(patch.frames?.set ?? {}).slice(0, MOST_PER_SAVE)) {
      if (!STICKY_ID.test(id)) continue;
      const exists = known.has(id);
      // Somebody else's frame or note, or a frame that isn't a note, is not theirs to replace.
      if (exists && !theirs(id)) continue;
      if (!exists && (count >= MOST_STICKIES || everyone >= MOST_STICKIES_ALL)) continue;
      const note = stickyFrom(id, raw, owner);
      if (!note) continue;
      if (!exists) {
        count++;
        everyone++;
      }
      set[id] = note;
    }
    const remove = (patch.frames?.remove ?? []).filter(theirs);
    return { frames: { ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) } };
  };
}

/** Saves a share link's sticky notes (see above): `secret` is the browser's own id, which is only ever hashed here. */
export async function saveSharedStickies(slug: string, version: string, patch: unknown, secret: string, by?: string) {
  if (!SECRET.test(secret)) throw new Error("This browser can't be told apart from others, so it can't leave notes.");
  const owner = createHash("sha256").update(`${slug}:${secret}`).digest("hex").slice(0, 24);
  return saveCanvasPatch(slug, version, canvasPatchSchema.parse(patch), by, onlyTheirStickies(owner));
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
