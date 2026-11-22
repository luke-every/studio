"use client";

import { useEffect, useRef, useState } from "react";

import { diffCanvas, type CanvasDoc } from "@/lib/canvas-doc";
import { loadCanvas, loadCanvasImage, loadSharedCanvas, loadSharedCanvasImage, patchCanvas, patchSharedCanvas, storeCanvasImage } from "@/lib/registry/actions";
import { stickyOwner } from "@/lib/sticky-owner";
import type { SavedCanvas } from "@/lib/canvas-saved";

/** Saved this long after the last change: a click is one save, a drag (the pointer is down) waits for the pointer to lift. */
const SAVE_AFTER_MS = 400;
/** But never later than this after the first unsaved change, a drag included, as Paper ends a gesture that has gone idle. */
const SAVE_AT_MOST_MS = 5000;
/** What a request that outlives the page may carry. */
const KEEPALIVE_MAX = 60_000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;

export type CloudStatus = "idle" | "saving" | "saved" | "offline";

const dirtyKey = (base: string) => `proto:canvas-dirty:${base}`;
const flag = (base: string, on?: boolean) => {
  try {
    if (on === undefined) return localStorage.getItem(dirtyKey(base)) === "1";
    if (on) localStorage.setItem(dirtyKey(base), "1");
    else localStorage.removeItem(dirtyKey(base));
  } catch {
    // Blocked storage: the canvas is saved when the next change is.
  }
  return on ?? false;
};

const EMPTY: SavedCanvas = { offsets: {}, pieces: [], frames: [] };

/** The pictures a canvas uses, by name: placed images, and the images in the fills of its frames. */
function picturesIn(canvas: SavedCanvas) {
  const names = new Set<string>();
  for (const piece of canvas.pieces) if (piece.kind === "image" && typeof piece.props.image === "string") names.add(piece.props.image);
  for (const frame of canvas.frames) {
    if (frame.fillImage) names.add(frame.fillImage.name);
    for (const fill of frame.fills ?? []) if (fill.kind === "image") names.add(fill.name);
  }
  return [...names];
}

/**
 * Keeps a version's canvas in the cloud (see `lib/registry/canvas.ts`), beside its comments, as Paper keeps a file: by sending what changed, not the whole.
 *
 *  - Opened, it takes what was saved, unless this browser has changes that were not saved yet (those are kept, and sent over it). With nothing saved, what
 *    this browser has is the first copy, so canvases made before there was a cloud are not lost.
 *  - A change is sent 0.4s after the last one (a drag waits for the pointer to lift, and goes after 5s at the latest): only the layers that changed, merged
 *    into whatever is saved, so two people changing different layers keep both.
 *  - As the tab hides or the window closes, what is unsent goes in a request the browser finishes without the page (`keepalive`); if it is too large for
 *    that, the window asks before it closes. The browser's own copy keeps everything meanwhile, and is what opens next time.
 *  - A save that fails (no connection) is tried again, a little later each time, and at once when the connection or the tab returns.
 *
 * A share link's page only reads, except for sticky notes: `stickies` (the ids of the ones this browser made) lets it send those, and only those, through
 * the link (see `saveSharedStickies`). `status` is for a small mark in the panel.
 */
export function useCloudCanvas({
  cloud,
  token,
  base,
  viewOnly,
  canvas,
  by,
  stickies,
  adopt,
  havePicture,
  pictureData,
  putPicture,
}: {
  cloud?: { slug: string; version: string };
  /** On a share page: what its link reads with. */
  token?: string;
  /** What this browser's own copy is kept under. */
  base: string;
  viewOnly: boolean;
  canvas: SavedCanvas;
  by?: string;
  /** On a share page that may leave sticky notes: the ids of the notes this browser made, the only layers it sends. */
  stickies?: ReadonlySet<string>;
  /** Puts a canvas that was in the cloud on the screen. */
  adopt: (canvas: SavedCanvas) => void;
  havePicture: (name: string) => boolean;
  pictureData: (name: string) => string;
  putPicture: (name: string, data: string) => void;
}): CloudStatus {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<CloudStatus>("idle");
  /** What the cloud holds, as far as this page knows: what a patch is made against. */
  const synced = useRef<SavedCanvas | null>(null);
  const uploaded = useRef(new Set<string>());
  const latest = useRef({ canvas, adopt, havePicture, pictureData, putPicture, by, stickies });
  const pressed = useRef(false);
  const inflight = useRef(false);
  const attempts = useRef(0);
  const timer = useRef(0);
  const firstUnsaved = useRef(0);
  const savedTimer = useRef(0);
  useEffect(() => {
    latest.current = { canvas, adopt, havePicture, pictureData, putPicture, by, stickies };
  });
  const slug = cloud?.slug;
  const version = cloud?.version;
  // A share link that may leave notes: it reads like any, and sends only its own notes.
  const noting = viewOnly && !!token && !!stickies;
  const sendsAny = !viewOnly || noting;

  // Whether the pointer is down: a drag is not sent until it lets go.
  useEffect(() => {
    const set = (on: boolean) => () => void (pressed.current = on);
    const [down, up] = [set(true), set(false)];
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, []);

  // Opened: what was saved is taken, and its pictures are fetched.
  useEffect(() => {
    if (!slug || !version) return undefined;
    let stale = false;
    const read = async () => {
      const result = await (token ? loadSharedCanvas(token) : loadCanvas(slug, version));
      if (stale || !result.ok) return;
      const doc = result.value as CanvasDoc | null;
      if (doc) {
        const found = doc.canvas as unknown as SavedCanvas;
        // What the cloud holds is what patches are made against, whether or not this browser's own copy is the one shown.
        synced.current = found;
        if (viewOnly || !flag(base)) latest.current.adopt(found);
        for (const name of picturesIn(found)) {
          uploaded.current.add(name);
          if (latest.current.havePicture(name)) continue;
          void (token ? loadSharedCanvasImage(token, name) : loadCanvasImage(slug, name)).then((picture) => {
            if (!stale && picture.ok && typeof picture.value === "string") latest.current.putPicture(name, picture.value);
          });
        }
      } else if (sendsAny) {
        // Nothing saved yet: this browser's own copy is the first, if there is one (a link's notes are made against an empty canvas).
        synced.current = EMPTY;
      }
      setReady(true);
    };
    void read();
    return () => {
      stale = true;
    };
    // Opened once per version: the canvas itself is read from the latest ref.
  }, [slug, version, token, base, viewOnly, sendsAny]);

  // Sending: what changed since the cloud's copy, with the pictures it uses.
  const send = useRef<() => void>(() => {});
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    if (!slug || !version || !sendsAny) return;
    // A link's notes: only the layers this browser made are compared, so nothing else of the canvas is ever in what it sends.
    const part = (canvas: SavedCanvas): SavedCanvas => (noting ? { offsets: {}, pieces: [], frames: canvas.frames.filter((frame) => latest.current.stickies?.has(frame.id)) } : canvas);
    const pending = () => (synced.current ? diffCanvas(part(synced.current), part(latest.current.canvas)) : null);
    const mark = (next: CloudStatus) => {
      window.clearTimeout(savedTimer.current);
      setStatus(next);
      // Said for a moment, then quiet again.
      if (next === "saved") savedTimer.current = window.setTimeout(() => setStatus("idle"), 1500);
    };
    const later = (ms: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), ms);
    };
    const flush = async () => {
      if (inflight.current || !synced.current) return;
      // A drag is not sent while the pointer is down, until it has gone on for too long.
      if (pressed.current && Date.now() - firstUnsaved.current < SAVE_AT_MOST_MS) return later(150);
      const sent = latest.current.canvas;
      const patch = diffCanvas(part(synced.current), part(sent));
      if (!patch) {
        flag(base, false);
        firstUnsaved.current = 0;
        return;
      }
      inflight.current = true;
      mark("saving");
      // Pictures first, once each, so a layer never arrives before its picture (a link's notes have none).
      for (const name of noting ? [] : picturesIn(sent)) {
        const data = latest.current.pictureData(name);
        if (data && !uploaded.current.has(name)) {
          const result = await storeCanvasImage(slug, name, data).catch(() => null);
          if (result?.ok) uploaded.current.add(name);
          else {
            // Not sent without it: everyone else would be given a layer whose picture never arrived. Tried again, later each time.
            inflight.current = false;
            mark("offline");
            later(Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempts.current));
            attempts.current += 1;
            return;
          }
        }
      }
      const result = await (noting && token ? patchSharedCanvas(token, patch, stickyOwner(), latest.current.by) : patchCanvas(slug, version, patch, latest.current.by)).catch(() => null);
      inflight.current = false;
      if (result?.ok) {
        synced.current = sent;
        attempts.current = 0;
        // Changed again while it was on its way: those go next.
        if (pending()) return later(SAVE_AFTER_MS);
        flag(base, false);
        firstUnsaved.current = 0;
        mark("saved");
      } else {
        // No connection, or the studio is locked: tried again, later each time.
        mark("offline");
        later(Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempts.current));
        attempts.current += 1;
      }
    };
    // Only marks it unsent: `flush` does the diff, once, when the timer fires, not on every frame of a drag.
    send.current = () => {
      if (!synced.current) return;
      flag(base, true);
      if (!firstUnsaved.current) firstUnsaved.current = Date.now();
      if (!inflight.current) later(SAVE_AFTER_MS);
    };
    retry.current = () => {
      attempts.current = 0;
      if (pending()) void flush();
    };
    // Leaving: what is unsent goes where the browser will finish it; too large for that, the window asks first.
    const keepalive = () => {
      const patch = pending();
      if (!patch) return true;
      const body = JSON.stringify(noting ? { token, owner: stickyOwner(), patch, by: latest.current.by } : { slug, version, patch, by: latest.current.by });
      if (body.length > KEEPALIVE_MAX) return false;
      void fetch("/api/canvas", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body }).catch(() => {});
      return true;
    };
    const hide = () => document.visibilityState === "hidden" && keepalive();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!keepalive()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const back = () => document.visibilityState === "visible" && retry.current();
    window.addEventListener("online", retry.current);
    window.addEventListener("pagehide", hide);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener("online", retry.current);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("visibilitychange", back);
    };
  }, [slug, version, viewOnly, base, noting, sendsAny, token]);

  // Changed: sent a moment later.
  // (Its parts are what is watched: the canvas object itself is new on every render.)
  useEffect(() => {
    if (ready && sendsAny) send.current();
  }, [canvas.offsets, canvas.pieces, canvas.frames, canvas.devices, ready, sendsAny]);

  return status;
}
