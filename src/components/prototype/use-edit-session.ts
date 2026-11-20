"use client";

import { useEffect, useRef, useState } from "react";

import { EDIT_IMAGE_DIR, mergeEdits, type Edit } from "@/lib/edits";
import { dataUrlOf, fitImage } from "@/lib/image";
import { painter, type Part } from "@/lib/edit-part";

import { paintFrames } from "./frame-page";

/** Changes to the same thing within this long are one step to undo. */
const SAME_STEP_MS = 800;

/** What a change is made to: the part as it was described when it was changed. */
type Touched = Pick<Part, "selector">;

/**
 * Edits made to the prototype on screen, with their history.
 *
 * The list of edits is the truth; the page is drawn from it. Every change
 * (and every undo or redo) puts the touched elements back as they were and
 * applies the list again, so what is on screen is always exactly what would
 * be saved. A new url starts it over, since the edits belong to one document.
 * Nothing is saved until the caller sends `edits` and `images` to the server.
 *
 * `frames` are the frames the version is on screen in: the one of the single view, or on the canvas one a screen; `copies`
 * are the static copies of screens drawn there instead (as scoped documents).
 * Saved, an edit applies wherever its element is found, whichever screen that is, so the list is drawn in every one of
 * them: an edit made on one screen shows on each screen that has that element, as it will once saved. A frame on
 * another address (a live version) is drawn by its own page, which is sent the list (see `paintFrames`).
 */
export function useEditSession(url: string | undefined, frames: () => HTMLIFrameElement[], copies?: () => Document[]) {
  const [state, setState] = useState<{ url?: string; edits: Edit[]; past: Edit[][]; future: Edit[][] }>({
    edits: [],
    past: [],
    future: [],
  });
  const current = state.url === url ? state : { url, edits: [] as Edit[], past: [] as Edit[][], future: [] as Edit[][] };
  const latest = useRef(current);
  useEffect(() => {
    latest.current = current;
  });

  const [images] = useState(() => new Map<string, { file: File; url: string; data?: string }>());
  const [brush] = useState(() => painter((src) => images.get(src)?.url));
  const lastStep = useRef<{ key: string; at: number } | null>(null);

  /** Draw the page from a list of edits. */
  const paint = (edits: Edit[]) =>
    paintFrames(
      frames(),
      edits,
      brush,
      Object.fromEntries([...images].flatMap(([path, { data }]) => (data ? [[path, data]] : []))),
      copies?.(),
    );

  /** Make `edits` the new state. `key` names what changed, so a drag is one step. */
  const commit = (edits: Edit[], key: string) => {
    const now = Date.now();
    const same = lastStep.current?.key === key && now - lastStep.current.at < SAME_STEP_MS;
    lastStep.current = { key, at: now };
    const before = latest.current;
    const next = { url, edits, past: same ? before.past : [...before.past, before.edits], future: [] as Edit[][] };
    latest.current = next;
    setState(next);
    paint(edits);
  };

  const apply = (edit: Edit, key: string) => commit(mergeEdits(latest.current.edits, [edit]), key);

  /** Change several properties of one element as a single step to undo. */
  const setStyles = (part: Touched, css: Record<string, string>) => {
    apply({ kind: "style", selector: part.selector, css }, `style:${part.selector}:${Object.keys(css).join(",")}`);
  };

  const setText = (part: Pick<Part, "selector" | "text" | "copy"> & { node?: number }, text: string) => {
    apply({ kind: "text", selector: part.selector, text, node: part.node, copy: part.copy ?? undefined, was: part.copy === null ? undefined : (part.text ?? undefined) }, `text:${part.selector}:${part.node ?? ""}`);
  };

  /** Changes a prop of a design-system component instance, drawn by the page itself when it can preview props. */
  const setProp = (part: Touched & { component: NonNullable<Part["component"]> }, prop: string, value: string | number | boolean) => {
    const { name } = part.component;
    apply({ kind: "prop", selector: part.selector, component: name, prop, value }, `prop:${part.selector}:${prop}`);
  };

  /** Swaps the picture of the element `selector` names. */
  const setImage = async (selector: string, picked: File, copy?: number | null) => {
    // One over the limit is shrunk first, so it can be kept.
    const file = await fitImage(picked);
    const extension = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${EDIT_IMAGE_DIR}/image-${Date.now().toString(36)}.${extension}`;
    // Shown from the file itself for now; the saved version carries it at `path`.
    const kept = { file, url: URL.createObjectURL(file), data: undefined as string | undefined };
    images.set(path, kept);
    apply({ kind: "image", selector, src: path, copy: copy ?? undefined }, `image:${selector}:${path}`);
    // A page on another address can only be shown the picture itself: read it, and draw again with it.
    void dataUrlOf(file).then((data) => {
      kept.data = data;
      paint(latest.current.edits);
    });
  };

  /** Put one element back as it was. */
  const reset = (selector: string) => commit(latest.current.edits.filter((edit) => edit.selector !== selector), `reset:${selector}`);

  /** Put everything back as it was. */
  const discard = () => commit([], "discard");

  const undo = () => {
    const { past, edits, future } = latest.current;
    if (!past.length) return;
    lastStep.current = null;
    const next = { url, edits: past[past.length - 1], past: past.slice(0, -1), future: [edits, ...future] };
    latest.current = next;
    setState(next);
    paint(next.edits);
  };

  const redo = () => {
    const { past, edits, future } = latest.current;
    if (!future.length) return;
    lastStep.current = null;
    const next = { url, edits: future[0], past: [...past, edits], future: future.slice(1) };
    latest.current = next;
    setState(next);
    paint(next.edits);
  };

  const imagesInUse = () =>
    [...images]
      .filter(([path]) => current.edits.some((edit) => edit.kind === "image" && edit.src === path))
      .map(([path, { file }]) => [path, file] as const);

  return {
    edits: current.edits,
    canUndo: current.past.length > 0,
    canRedo: current.future.length > 0,
    setStyles,
    setText,
    setProp,
    setImage,
    reset,
    undo,
    redo,
    discard,
    /** Draws the edits again: a page has just loaded that should show them too. */
    redraw: () => paint(latest.current.edits),
    imagesInUse,
    /** The picture an element's swap shows, if it has been swapped: to preview it. */
    imageOf: (selector: string) => {
      const edit = current.edits.findLast((item) => item.kind === "image" && item.selector === selector);
      return edit?.kind === "image" ? (images.get(edit.src)?.url ?? null) : null;
    },
    has: (selector: string) => current.edits.some((edit) => edit.selector === selector),
  };
}

export type EditSession = ReturnType<typeof useEditSession>;
