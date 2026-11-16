"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
/** What couldn't be written to the browser is kept for the visit. */
const memory = new Map<string, string>();

const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? "[]";
  } catch {
    return memory.get(key) ?? "[]";
  }
};

/** The suggestions this person has turned away on a version, kept in their browser: it is their view of the frame, not the handoff's. */
export function useDismissed(version: string) {
  const key = `dismissed:${version}`;
  const raw = useSyncExternalStore(subscribe, () => read(key), () => "[]");
  const ids = useMemo(() => JSON.parse(raw) as string[], [raw]);
  const dismiss = useCallback(
    (id: string) => {
      const next = JSON.stringify([...(JSON.parse(read(key)) as string[]), id]);
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // Kept for this visit only.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );
  return { ids, dismiss };
}
