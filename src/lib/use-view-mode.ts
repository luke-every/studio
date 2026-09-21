"use client";

import { useCallback, useSyncExternalStore } from "react";

export type ViewMode = "grid" | "list";

const STORAGE_KEY = "proto.view-mode";
const DEFAULT: ViewMode = "grid";

/* The chosen view mode is browser state, so React reads it as an external
 * store rather than mirroring it — no effect, no second render pass, and the
 * server snapshot stays "grid" so hydration matches. */
const cache = new Map<string, ViewMode>();
const listeners = new Map<string, Set<() => void>>();

function read(key: string): ViewMode {
  if (cache.has(key)) return cache.get(key)!;
  let value: ViewMode = DEFAULT;
  try {
    const stored = localStorage.getItem(key);
    if (stored === "grid" || stored === "list") value = stored;
  } catch {
    // Blocked storage: the default is fine.
  }
  cache.set(key, value);
  return value;
}

function write(key: string, value: ViewMode) {
  cache.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    // Blocked storage: the choice simply won't persist.
  }
  listeners.get(key)?.forEach((listener) => listener());
}

function subscribe(key: string) {
  return (listener: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    return () => set.delete(listener);
  };
}

/**
 * How the user prefers to browse. Remembered between visits, because it is a
 * standing preference rather than a per-page choice.
 */
export function useViewMode(scope = "default") {
  const key = `${STORAGE_KEY}:${scope}`;
  const mode = useSyncExternalStore(
    subscribe(key),
    () => read(key),
    () => DEFAULT,
  );
  const choose = useCallback((next: ViewMode) => write(key, next), [key]);

  return [mode, choose] as const;
}
