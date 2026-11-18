/**
 * What a person has left on a prototype's canvas, kept in this browser so it is there when they come back: where each
 * screen was dragged to, and (soon) the components placed on it. Per prototype, by its address. Per-person state stays
 * client-side (see CLAUDE.md); the shape is one object so moving it into the registry later is a change here only.
 */
export type Offsets = Record<string, { x: number; y: number }>;
/** A real component of the website placed on the canvas: which story it is (see the stage prototype), the props changed from the story's, and its size. Where it sits is in `offsets`, under its own key. */
export type Piece = { id: string; /** The frame it is in, when it is in one: it moves with the frame, and is cut off at its edge when the frame clips. */ parent?: string; story: string; label: string; props: Record<string, unknown>; width: number; height: number };
/** A frame drawn on the canvas (the F tool): an empty box, in the canvas's own units, to put things in. */
export type CanvasFrame = { id: string; name: string; x: number; y: number; width: number; height: number; /** A CSS colour; the surface colour when absent. */ fill?: string; radius?: number; /** Cuts off what is in it at its edge. */ clip?: boolean };
export type SavedCanvas = { offsets: Offsets; pieces: Piece[]; frames: CanvasFrame[] };

const key = (base: string) => `proto:canvas:${base}`;

export function readCanvas(base: string): SavedCanvas {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(key(base));
    const found = raw ? (JSON.parse(raw) as Partial<SavedCanvas>) : null;
    return { offsets: found?.offsets && typeof found.offsets === "object" ? found.offsets : {}, pieces: Array.isArray(found?.pieces) ? found.pieces : [], frames: Array.isArray(found?.frames) ? found.frames : [] };
  } catch {
    return { offsets: {}, pieces: [], frames: [] };
  }
}

export function writeCanvas(base: string, saved: SavedCanvas) {
  try {
    const empty = !Object.keys(saved.offsets).length && !saved.pieces.length && !saved.frames.length;
    if (empty) localStorage.removeItem(key(base));
    else localStorage.setItem(key(base), JSON.stringify(saved));
  } catch {
    // Blocked or full storage: the canvas is as it was left until the page closes.
  }
}
