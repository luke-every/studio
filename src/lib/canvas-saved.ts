/**
 * What a person has left on a prototype's canvas, kept in this browser so it is there when they come back: where each
 * screen was dragged to, and (soon) the components placed on it. Per prototype, by its address. Per-person state stays
 * client-side (see CLAUDE.md); the shape is one object so moving it into the registry later is a change here only.
 */
import type { Layout } from "@/lib/canvas-layout";

/** How a layer is sized along each side: its own number (fixed), as much as its contents need (hug), or the room left in the auto layout frame it is in (fill). */
export type Sizing = { width?: "fixed" | "hug" | "fill"; height?: "fixed" | "hug" | "fill" };
/** What a layer in a frame (one without a layout) does when the frame is resized, as CSS does for an absolutely positioned child: keeps its distance from the start (left, top), from the end (right, bottom), from both (it stretches between them), or from the middle. Absent on a side: it stays where it is. */
export type Pin = { x?: "start" | "end" | "both" | "center"; y?: "start" | "end" | "both" | "center" };
export type Offsets = Record<string, { x: number; y: number }>;
/** A real component of the website placed on the canvas: which story it is (see the stage prototype), the props changed from the story's, and its size. Where it sits is in `offsets`, under its own key. */
export type Piece = { id: string; /** Absent for a component; a text or an image placed as itself (see public/canvas-layer.html), with its words or its picture's name in `props`. */ kind?: "text" | "image"; /** The frame it is in, when it is in one: it moves with the frame, and is cut off at its edge when the frame clips. */ parent?: string; story: string; label: string; /** The component's own name, for a component (what `label` was when it was dragged out, before it could be renamed). */ component?: string; /** A component given a size of its own (in pixels): put on its outermost element where it is drawn; not part of its props. Absent: it is as big as it comes. */ fixedWidth?: number; fixedHeight?: number; props: Record<string, unknown>; width: number; height: number; /** Not drawn, and not reachable on the canvas. */ hidden?: boolean; /** Only `fill` is kept here: a text hugs when it has no width of its own, an image is fixed. */ sizing?: Sizing; pin?: Pin; /** Drawn, but not moved or selected by a press on the canvas. */ locked?: boolean };
/** A frame drawn on the canvas (the F tool): an empty box, in the canvas's own units, to put things in. */
/** One fill of a frame: a colour or a picture (kept in this browser under `name`, how it sits in the frame given by `mode`), shown or not. */
export type FillLayer = { kind: "solid"; color: string; hidden?: boolean } | { kind: "image"; name: string; mode: "fill" | "fit" | "tile" | "stretch"; hidden?: boolean };
/** A frame's fills, the top one first as in a list of them: `fills` when it has been given any, otherwise the single colour (and picture over it) frames began with. */
export function fillsOf(frame: Pick<CanvasFrame, "fills" | "fill" | "fillImage">, surface = "#ffffff"): FillLayer[] {
  if (frame.fills) return frame.fills;
  return [...(frame.fillImage ? [{ kind: "image" as const, name: frame.fillImage.name, mode: frame.fillImage.mode }] : []), { kind: "solid" as const, color: frame.fill ?? surface }];
}
export type CanvasShape = "rectangle" | "ellipse" | "line" | "arrow" | "polygon" | "star" | "path";
export type CanvasFrame = { id: string; /** Drawn with a shape tool rather than the frame tool: it is the shape (and holds nothing). A line (or arrow) runs corner to corner of its box (from the bottom left when `flip`); a path, polygon or star is its `points`, each 0 to 1 across the box. */ shape?: CanvasShape; flip?: boolean; points?: [number, number][]; closed?: boolean; /** The frame it is in, when it is in one: it moves with it, and goes with it. */ parent?: string; name: string; x: number; y: number; width: number; height: number; /** A CSS colour; the surface colour when absent. */ fill?: string; /** A picture in place of the colour (kept in this browser under `name`, like the images put on the canvas) and how it sits in the frame. */ fillImage?: { name: string; mode: "fill" | "fit" | "tile" | "stretch" }; radius?: number; /** Any number of fills, top first (see `fillsOf`); once set it is what is drawn, and `fill` and `fillImage` are no longer read. */ fills?: FillLayer[]; /** A line round the edge: its colour and width. */ stroke?: string; strokeWidth?: number; /** Absent: fixed, or hugging what is in it when it has a layout. */ sizing?: Sizing; pin?: Pin; hidden?: boolean; locked?: boolean; /** Cuts off what is in it at its edge. */ clip?: boolean; /** Lays what is in it out in a row or a column (see lib/canvas-layout.ts); absent for a frame whose contents sit where they were put. */ layout?: Layout };
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
