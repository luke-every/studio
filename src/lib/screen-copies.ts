"use client";

import { useCallback, useSyncExternalStore } from "react";

import { designSystemNames } from "@/components/prototype/frame-page";
import { snapshotOf, type Snapshot } from "@/lib/dom-snapshot";

/**
 * Static copies of the canvas's screens (see dom-snapshot.ts).
 *
 * A screen that is live and loaded on the canvas is read where it stands (`donate`): no second load, no waiting for a
 * page to settle again. The reads are done one after another, with the page left to breathe between them, and what has been
 * read is kept for the session, so switching to copies and back costs nothing the second time. A page the studio can't
 * read (it is on another port) comes back `unavailable`, and its screen stays live.
 */

export type Copy = { state: "reading" | "ready" | "unavailable"; snapshot?: Snapshot; error?: string };

const copies = new Map<string, Copy>();
const listeners = new Map<string, Set<() => void>>();
const jobs: { key: string; frame: HTMLIFrameElement; generation: number }[] = [];
const fontsAdded = new Set<string>();
let draining = false;
/** Counts how often everything was forgotten, so a read that was under way then isn't kept. */
let generation = 0;

const keyOf = (src: string, width: number) => `${width}|${src}`;
const tell = (key: string) => listeners.get(key)?.forEach((listener) => listener());
const put = (key: string, copy: Copy) => {
  copies.set(key, copy);
  tell(key);
};

/** A page's fonts belong to the document that shows its copies, once however many screens use them. */
function addFonts(css: string) {
  if (!css || fontsAdded.has(css)) return;
  fontsAdded.add(css);
  const style = document.createElement("style");
  style.dataset.studioCopyFonts = "";
  style.textContent = css;
  document.head.appendChild(style);
}

async function drain() {
  if (draining) return;
  draining = true;
  while (jobs.length) {
    const job = jobs.shift()!;
    // Gone before its turn (its screen was drawn another way): forgotten, so whichever frame is there next can be read.
    if (!job.frame.isConnected) {
      copies.delete(job.key);
      tell(job.key);
      continue;
    }
    try {
      const snapshot = await snapshotOf(job.frame, { components: designSystemNames() });
      if (job.generation === generation) {
        addFonts(snapshot.fonts);
        put(job.key, { state: "ready", snapshot });
      }
    } catch (error) {
      if (job.generation === generation) put(job.key, { state: "unavailable", error: error instanceof Error ? error.message : "Couldn't read the page." });
    }
    // The page is left to breathe between screens.
    await new Promise((done) => setTimeout(done, 0));
  }
  draining = false;
}

/** Reads a live, loaded frame into the copy of `src` at `width`, unless that is already being or has been done. */
export function donate(src: string, width: number, frame: HTMLIFrameElement) {
  const key = keyOf(src, width);
  if (copies.has(key)) return;
  put(key, { state: "reading" });
  jobs.push({ key, frame, generation });
  void drain();
}

/** Forgets every copy, so each is read again the next time its screen offers its frame. */
export function forgetCopies() {
  generation++;
  copies.clear();
  jobs.length = 0;
  for (const key of listeners.keys()) tell(key);
}

/** The copy of `src` at `width`, once it has been read: null until it is. Nothing is looked at unless `wanted`. */
export function useScreenCopy(src: string, width: number, wanted: boolean): Copy | null {
  const key = keyOf(src, width);
  const subscribe = useCallback(
    (listener: () => void) => {
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    [key],
  );
  const copy = useSyncExternalStore(
    subscribe,
    () => copies.get(key) ?? null,
    () => null,
  );
  return wanted ? copy : null;
}

/**
 * Screens on the canvas are drawn as copies unless the person switched that off. The switch itself is offered only while
 * developing; `COPIES_ENABLED` false takes copies away entirely (every screen is its page).
 */
export const COPIES_ENABLED = true;
export const COPIES_OFFERED = COPIES_ENABLED && process.env.NODE_ENV === "development";
const FLAG = "proto:canvas-copies";
const CHANGED = "proto:canvas-copies:changed";

export function useCopiesChoice(): [boolean, (on: boolean) => void] {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGED, listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener(CHANGED, listener);
    };
  }, []);
  const on = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(FLAG) !== "0";
      } catch {
        return true;
      }
    },
    () => true,
  );
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(FLAG, next ? "1" : "0");
    } catch {
      // Blocked storage: it lasts until the page is closed.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [COPIES_ENABLED && on, set];
}
