"use client";

import { useEffect, useRef, useState } from "react";

import { EDIT_IMAGE_DIR, mergeEdits, type Edit, type EditChange } from "@/lib/edits";
import { painter, type Part } from "@/lib/edit-part";

import { paintFrames } from "./frame-page";

/** Changes to the same thing within this long are one step to undo. */
const SAME_STEP_MS = 800;

/** What a change is made to: the part as it was described when it was changed, which says what it was before. */
type Touched = Pick<Part, "selector" | "tag" | "text" | "css">;

/**
 * Edits made to the prototype on screen, with their history.
 *
 * The list of edits is the truth; the page is drawn from it. Every change
 * (and every undo or redo) puts the touched elements back as they were and
 * applies the list again, so what is on screen is always exactly what would
 * be saved. A new url starts it over, since the edits belong to one document.
 * Nothing is saved until the caller sends `edits` and `images` to the server.
 *
 * `frames` are the frames the version is on screen in: the one of the single view, or on the canvas one a screen.
 * Saved, an edit applies wherever its element is found, whichever screen that is, so the list is drawn in every one of
 * them: an edit made on one screen shows on each screen that has that element, as it will once saved. A frame on
 * another address (a live version) is drawn by its own page, which is sent the list (see `paintFrames`).
 */
export function useEditSession(url: string | undefined, frames: () => HTMLIFrameElement[]) {
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

  const [images] = useState(() => new Map<string, { file: File; url: string }>());
  const [brush] = useState(() => painter((src) => images.get(src)?.url));
  const lastStep = useRef<{ key: string; at: number } | null>(null);
  // What each thing changed was before it was first touched, for saying a change in words (a live version's are given to Claude).
  const before = useRef(new Map<string, { tag: string; words: string | null; css: Record<string, string> }>());
  const remember = (part: Touched, properties: string[]) => {
    const was = before.current.get(part.selector) ?? { tag: part.tag, words: part.text, css: {} };
    for (const property of properties) was.css[property] ??= part.css[property] ?? "";
    before.current.set(part.selector, was);
  };

  /** Draw the page from a list of edits. */
  const paint = (edits: Edit[]) => paintFrames(frames(), edits, brush);

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
    remember(part, Object.keys(css));
    apply({ kind: "style", selector: part.selector, css }, `style:${part.selector}:${Object.keys(css).join(",")}`);
  };

  const setText = (part: Touched, text: string) => {
    remember(part, []);
    apply({ kind: "text", selector: part.selector, text }, `text:${part.selector}`);
  };

  /** Swaps the picture of the element `selector` names. */
  const setImage = (selector: string, file: File) => {
    const extension = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${EDIT_IMAGE_DIR}/image-${Date.now().toString(36)}.${extension}`;
    // Shown from the file itself for now; the saved version carries it at `path`.
    images.set(path, { file, url: URL.createObjectURL(file) });
    apply({ kind: "image", selector, src: path }, `image:${selector}:${path}`);
  };

  /** Put one element back as it was. */
  const reset = (selector: string) => commit(latest.current.edits.filter((edit) => edit.selector !== selector), `reset:${selector}`);

  /** Put everything back as it was. */
  const discard = () => commit([], "discard");

  /**
   * Lets go of the edits without putting the page back: they have been made in the prototype's own code (a live
   * version, by Claude), so the page is loaded again by whoever calls this, and shows them for real.
   */
  const forget = () => {
    lastStep.current = null;
    before.current.clear();
    const next = { url, edits: [] as Edit[], past: [] as Edit[][], future: [] as Edit[][] };
    latest.current = next;
    setState(next);
    // So a page that loads again isn't sent them again.
    paint([]);
  };

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

  /** The edits with what each thing was before, for putting them in words. */
  const changes = (): EditChange[] =>
    latest.current.edits.map((edit) => {
      const was = before.current.get(edit.selector);
      return { edit, tag: was?.tag, words: was?.words ?? undefined, from: edit.kind === "style" ? was?.css : undefined };
    });

  return {
    edits: current.edits,
    canUndo: current.past.length > 0,
    canRedo: current.future.length > 0,
    setStyles,
    setText,
    setImage,
    reset,
    undo,
    redo,
    discard,
    forget,
    /** Draws the edits again: a page has just loaded that should show them too. */
    redraw: () => paint(latest.current.edits),
    imagesInUse,
    changes,
    has: (selector: string) => current.edits.some((edit) => edit.selector === selector),
  };
}

export type EditSession = ReturnType<typeof useEditSession>;
