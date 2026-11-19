"use client";

import { useSyncExternalStore } from "react";

/**
 * The open canvas's zoom, offered to the bar above it (which is not inside the canvas): where it is, and the ways to change it.
 * The canvas publishes while it is mounted and takes it back when it goes. Only what reads it (the zoom menu) is drawn again.
 */
export type CanvasZoom = { scale: number; zoomIn: () => void; zoomOut: () => void; reset: () => void; fit: () => void; /** Opens the screen selected (or the one an element selected is in) to use it; null when there is none. */ play: (() => void) | null };

let current: CanvasZoom | null = null;
const listeners = new Set<() => void>();

export function publishZoom(next: CanvasZoom | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function useCanvasZoom() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
    () => null,
  );
}
