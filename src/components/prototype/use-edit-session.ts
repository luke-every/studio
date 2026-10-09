"use client";

import { useEffect, useRef, useState } from "react";

import { selectorFor, setPicture, writeText } from "@/lib/edit-dom";
import { EDIT_IMAGE_DIR, mergeEdits, type Edit } from "@/lib/edits";

type Original = { style: string | null; html: string; src: string | null };

/** Changes to the same thing within this long are one step to undo. */
const SAME_STEP_MS = 800;

/**
 * Edits made to the prototype on screen, with their history.
 *
 * The list of edits is the truth; the page is drawn from it. Every change
 * (and every undo or redo) puts the touched elements back as they were and
 * applies the list again, so what is on screen is always exactly what would
 * be saved. A new url starts it over, since the edits belong to one document.
 * Nothing is saved until the caller sends `edits` and `images` to the server.
 */
export function useEditSession(url: string | undefined) {
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

  // How elements looked before they were touched, so they can be put back.
  const originals = useRef(new Map<Element, Original>());
  const documentRef = useRef<Document | null>(null);
  const images = useRef(new Map<string, { file: File; url: string }>());
  const lastStep = useRef<{ key: string; at: number } | null>(null);

  const remember = (element: Element) => {
    documentRef.current = element.ownerDocument;
    if (originals.current.has(element)) return;
    originals.current.set(element, {
      style: element.getAttribute("style"),
      html: element.innerHTML,
      src: element.getAttribute("src"),
    });
  };

  /** Draw the page from a list of edits. */
  const paint = (edits: Edit[]) => {
    for (const [element, original] of originals.current) {
      if (original.style === null) element.removeAttribute("style");
      else element.setAttribute("style", original.style);
      element.innerHTML = original.html;
      if (original.src === null) element.removeAttribute("src");
      else element.setAttribute("src", original.src);
    }
    const doc = documentRef.current;
    if (!doc) return;
    for (const edit of edits) {
      const element = doc.querySelector(edit.selector);
      if (!element) continue;
      remember(element);
      if (edit.kind === "style") {
        for (const [property, value] of Object.entries(edit.css)) (element as HTMLElement).style.setProperty(property, value, "important");
      } else if (edit.kind === "text") {
        writeText(element, edit.text);
      } else {
        const picture = images.current.get(edit.src);
        if (picture) setPicture(element, picture.url);
      }
    }
  };

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
  const setStyles = (element: Element, css: Record<string, string>) => {
    remember(element);
    const selector = selectorFor(element);
    apply({ kind: "style", selector, css }, `style:${selector}:${Object.keys(css).join(",")}`);
  };

  const setText = (element: Element, text: string) => {
    remember(element);
    const selector = selectorFor(element);
    apply({ kind: "text", selector, text }, `text:${selector}`);
  };

  const setImage = (element: Element, file: File) => {
    remember(element);
    const extension = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${EDIT_IMAGE_DIR}/image-${Date.now().toString(36)}.${extension}`;
    // Shown from the file itself for now; the saved version carries it at `path`.
    images.current.set(path, { file, url: URL.createObjectURL(file) });
    const selector = selectorFor(element);
    apply({ kind: "image", selector, src: path }, `image:${selector}:${path}`);
  };

  /** Put one element back as it was. */
  const reset = (element: Element) => {
    const selector = selectorFor(element);
    commit(latest.current.edits.filter((edit) => edit.selector !== selector), `reset:${selector}`);
  };

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
    [...images.current]
      .filter(([path]) => current.edits.some((edit) => edit.kind === "image" && edit.src === path))
      .map(([path, { file }]) => [path, file] as const);

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
    imagesInUse,
    has: (element: Element) => current.edits.some((edit) => edit.selector === selectorFor(element)),
  };
}

export type EditSession = ReturnType<typeof useEditSession>;
