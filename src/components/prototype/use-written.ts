"use client";

import { useCallback, useSyncExternalStore } from "react";

import { useStudio } from "@/lib/data/studio-store";
import { stepWritten } from "@/lib/registry/actions";

/**
 * What the studio has written into a project's files on this page, as steps that can be put back (see `written-history.ts`). The page counts them as they are
 * written, so ⌘Z never reaches back into something written before it was opened. Undoing a step shows the file as it was: the dev server reloads it.
 */
const counts = new Map<string, { undo: number; redo: number }>();
const listeners = new Set<() => void>();
const NONE = { undo: 0, redo: 0 };
const changed = () => listeners.forEach((one) => one());

/** Said by whoever saved: one more step to undo, and nothing to redo. */
export function announceWrite(slug: string) {
  const now = counts.get(slug) ?? NONE;
  counts.set(slug, { undo: now.undo + 1, redo: 0 });
  changed();
}

export function useWritten(slug: string | undefined) {
  const { notify } = useStudio();
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (slug ? (counts.get(slug) ?? NONE) : NONE),
    () => NONE,
  );
  const step = useCallback(
    async (direction: "undo" | "redo") => {
      if (!slug) return;
      const result = await stepWritten(slug, direction);
      if (!result.ok || !result.value.ok) {
        notify(result.ok && !result.value.ok ? result.value.error : "That couldn't be put back.", true);
        return;
      }
      const now = counts.get(slug) ?? NONE;
      counts.set(slug, direction === "undo" ? { undo: now.undo - 1, redo: now.redo + 1 } : { undo: now.undo + 1, redo: now.redo - 1 });
      changed();
    },
    [slug, notify],
  );
  return { canUndo: state.undo > 0, canRedo: state.redo > 0, undo: () => void step("undo"), redo: () => void step("redo") };
}

export type Written = ReturnType<typeof useWritten>;
