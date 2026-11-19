"use client";

import { useEffect, useRef, useState } from "react";

import { loadCanvas, loadCanvasImage, loadSharedCanvas, loadSharedCanvasImage, storeCanvas, storeCanvasImage } from "@/lib/registry/actions";
import type { CanvasDoc } from "@/lib/canvas-doc";
import type { SavedCanvas } from "@/lib/canvas-saved";

/** After the last change this long, the canvas is saved: a drag or a resize is many changes and one save. */
const SAVE_AFTER_MS = 2500;

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
 * Keeps a version's canvas in the cloud (see `lib/registry/canvas.ts`), beside its comments. Opened, it takes what was saved there, unless this browser has
 * changes that were not saved yet (those are kept, and saved over it); with nothing saved, what this browser has is saved as the first copy, so canvases made
 * before there was a cloud are not lost. Changes are saved a moment after the last. A share link's page only reads. The browser's own copy stays as it was: it is
 * what the page opens with, and what is left when there is no connection.
 */
export function useCloudCanvas({
  cloud,
  token,
  base,
  viewOnly,
  canvas,
  by,
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
  /** Puts a canvas that was in the cloud on the screen. */
  adopt: (canvas: SavedCanvas) => void;
  havePicture: (name: string) => boolean;
  pictureData: (name: string) => string;
  putPicture: (name: string, data: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const saved = useRef("");
  const uploaded = useRef(new Set<string>());
  const latest = useRef({ canvas, adopt, havePicture, pictureData, putPicture, by });
  useEffect(() => {
    latest.current = { canvas, adopt, havePicture, pictureData, putPicture, by };
  });
  const slug = cloud?.slug;
  const version = cloud?.version;

  // Opened: what was saved is taken, and its pictures are fetched.
  useEffect(() => {
    if (!slug || !version) return undefined;
    let stale = false;
    const read = async () => {
      const result = await (token ? loadSharedCanvas(token) : loadCanvas(slug, version));
      if (stale) return;
      if (!result.ok) return;
      const doc = result.value as CanvasDoc | null;
      if (doc && (viewOnly || !flag(base))) {
        const found = doc.canvas as unknown as SavedCanvas;
        saved.current = JSON.stringify(found);
        latest.current.adopt(found);
        for (const name of picturesIn(found)) {
          if (latest.current.havePicture(name)) continue;
          void (token ? loadSharedCanvasImage(token, name) : loadCanvasImage(slug, name)).then((picture) => {
            if (!stale && picture.ok && typeof picture.value === "string") latest.current.putPicture(name, picture.value);
          });
        }
      } else if (!doc && !viewOnly) {
        // Nothing saved yet: this browser's own copy is the first, if there is one.
        const own = latest.current.canvas;
        if (own.pieces.length || own.frames.length || Object.keys(own.offsets).length) flag(base, true);
      }
      setReady(true);
    };
    void read();
    return () => {
      stale = true;
    };
    // Opened once per version: the canvas itself is read from the latest ref.
  }, [slug, version, token, base, viewOnly]);

  // Changed: saved a moment later, with the pictures it uses that the cloud doesn't have yet.
  const json = JSON.stringify(canvas);
  useEffect(() => {
    if (!slug || !version || !ready || viewOnly) return undefined;
    if (json === saved.current) return undefined;
    // A canvas nobody has put anything on is not worth a file.
    if (!saved.current && !canvas.pieces.length && !canvas.frames.length && !Object.keys(canvas.offsets).length) return undefined;
    flag(base, true);
    const save = async () => {
      const now = latest.current;
      const text = JSON.stringify(now.canvas);
      for (const name of picturesIn(now.canvas)) {
        const data = now.pictureData(name);
        if (data && !uploaded.current.has(name)) {
          const result = await storeCanvasImage(slug, name, data);
          if (result.ok) uploaded.current.add(name);
        }
      }
      const result = await storeCanvas(slug, version, now.canvas, now.by);
      if (result.ok) {
        saved.current = text;
        // Nothing changed since: it is all in the cloud.
        if (JSON.stringify(latest.current.canvas) === text) flag(base, false);
      }
    };
    const timer = window.setTimeout(() => void save(), SAVE_AFTER_MS);
    // Leaving or hiding the tab saves at once, as far as it can.
    const leave = () => {
      if (document.visibilityState === "hidden") {
        window.clearTimeout(timer);
        void save();
      }
    };
    document.addEventListener("visibilitychange", leave);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json, slug, version, ready, viewOnly, base]);
}
