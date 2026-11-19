import { z } from "zod";

/**
 * A canvas as it is kept in the cloud: one file per version beside its comments (`canvas/<slug>/<version>.json`), and a picture is a file of its own
 * (`canvas/<slug>/images/<name>.json`, a data address as text), written once and never replaced. `savedAt` is when it was saved, so a copy can tell
 * whether it is behind. What a canvas holds is checked only for its shape here; the canvas itself reads each piece and frame as it always has.
 */
export const canvasDocSchema = z.object({
  savedAt: z.string(),
  by: z.string().optional(),
  canvas: z.object({
    offsets: z.record(z.string(), z.object({ x: z.number(), y: z.number() })),
    pieces: z.array(z.record(z.string(), z.unknown())),
    frames: z.array(z.record(z.string(), z.unknown())),
    /** The devices the screens are shown on, once somebody has chosen them. */
    devices: z.array(z.string().max(40)).max(20).optional(),
  }),
});
export type CanvasDoc = z.infer<typeof canvasDocSchema>;

/** The name a picture is kept under: what the canvas makes (`piece-ab12cd`), and nothing that could become another path. */
export const IMAGE_NAME = /^[a-z0-9-]{3,40}$/;
/** A picture as a data address: a PNG or JPEG, as large as the canvas ever makes one (it shrinks them to 1600px). */
export const IMAGE_DATA = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export const MAX_IMAGE_CHARS = 4_000_000;

/**
 * What a save sends: not the whole canvas but what changed since the cloud's copy, by layer (`frames/<id>`, `pieces/<id>`, `offsets/<key>`), as Paper
 * sends edits by path. Each list says which layers were set (added or changed), which were removed, and, when the stacking order changed, the order. Applied
 * to whatever the cloud holds now, so two people changing different layers keep both changes, and a patch can safely be sent twice.
 */
export type ListPatch = { set?: Record<string, Record<string, unknown>>; remove?: string[]; order?: string[] };
export type CanvasPatch = { pieces?: ListPatch; frames?: ListPatch; offsets?: { set?: Record<string, { x: number; y: number }>; remove?: string[] }; /** The devices chosen, all of them. */ devices?: string[] };

const listPatch = z.object({ set: z.record(z.string(), z.record(z.string(), z.unknown())).optional(), remove: z.array(z.string()).optional(), order: z.array(z.string()).optional() });
export const canvasPatchSchema = z.object({
  pieces: listPatch.optional(),
  frames: listPatch.optional(),
  offsets: z.object({ set: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).optional(), remove: z.array(z.string()).optional() }).optional(),
  devices: z.array(z.string().max(40)).max(20).optional(),
});

type Item = { id: string };
type Canvas = { offsets: Record<string, { x: number; y: number }>; pieces: Item[]; frames: Item[]; devices?: string[] };

function diffList(from: Item[], to: Item[]): ListPatch | undefined {
  const before = new Map(from.map((item) => [item.id, item]));
  const set: Record<string, Record<string, unknown>> = {};
  for (const item of to) {
    const was = before.get(item.id);
    // Layers are replaced when they change, so the same object is nearly always the same layer: only a new object is compared.
    if (was !== item && JSON.stringify(was) !== JSON.stringify(item)) set[item.id] = item as unknown as Record<string, unknown>;
  }
  const now = new Set(to.map((item) => item.id));
  const remove = [...before.keys()].filter((id) => !now.has(id));
  const sameOrder = from.length === to.length && from.every((item, at) => item.id === to[at].id);
  if (!Object.keys(set).length && !remove.length && sameOrder) return undefined;
  return { ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}), ...(sameOrder ? {} : { order: to.map((item) => item.id) }) };
}

/** What changed from one canvas to another, or null when nothing did. */
export function diffCanvas(from: Canvas, to: Canvas): CanvasPatch | null {
  const set: Record<string, { x: number; y: number }> = {};
  for (const [key, spot] of Object.entries(to.offsets)) {
    const was = from.offsets[key];
    if (!was || was.x !== spot.x || was.y !== spot.y) set[key] = spot;
  }
  const remove = Object.keys(from.offsets).filter((key) => !(key in to.offsets));
  const pieces = diffList(from.pieces, to.pieces);
  const frames = diffList(from.frames, to.frames);
  const offsets = Object.keys(set).length || remove.length ? { ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) } : undefined;
  // Once chosen the devices are always kept, so only a different choice is a change.
  const devices = to.devices && JSON.stringify(from.devices) !== JSON.stringify(to.devices) ? to.devices : undefined;
  if (!pieces && !frames && !offsets && !devices) return null;
  return { ...(pieces ? { pieces } : {}), ...(frames ? { frames } : {}), ...(offsets ? { offsets } : {}), ...(devices ? { devices } : {}) };
}

function applyList<T extends Item>(list: T[], patch?: ListPatch): T[] {
  if (!patch) return list;
  const map = new Map(list.map((item) => [item.id, item]));
  for (const id of patch.remove ?? []) map.delete(id);
  for (const [id, item] of Object.entries(patch.set ?? {})) map.set(id, { ...item, id } as unknown as T);
  const existing = list.filter((item) => map.has(item.id)).map((item) => item.id);
  // The order the patch gives comes first; layers it doesn't know (somebody else's, added since) follow, in the order they were.
  const ordered = patch.order ? patch.order.filter((id) => map.has(id)) : existing;
  const placed = new Set(ordered);
  const rest = [...map.keys()].filter((id) => !placed.has(id));
  return [...ordered, ...rest].map((id) => map.get(id)!);
}

/** A canvas with a patch applied: nothing is changed in place. */
export function applyPatch<T extends Canvas>(canvas: T, patch: CanvasPatch): T {
  const offsets = { ...canvas.offsets };
  for (const key of patch.offsets?.remove ?? []) delete offsets[key];
  Object.assign(offsets, patch.offsets?.set ?? {});
  return { ...canvas, offsets, pieces: applyList(canvas.pieces, patch.pieces), frames: applyList(canvas.frames, patch.frames), ...(patch.devices ? { devices: patch.devices } : {}) };
}
