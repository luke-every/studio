"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Who is using the studio on this browser. Nobody signs in — this is a name
 * picked from a short list, kept in localStorage, and used to credit what you
 * save. A guest is somebody who chose not to say.
 */
export const GUEST = "";
const SEEDED = ["Luke", "Victor"];
const CURRENT_KEY = "studio.user";
const ADDED_KEY = "studio.users";

export type UserState = {
  /** False until the browser has been read; the server renders with it false. */
  ready: boolean;
  /** The people on offer: the seeded ones, then anyone added here. */
  people: string[];
  /** The chosen name, GUEST for a guest, null if nobody has chosen yet. */
  current: string | null;
};

const SERVER: UserState = { ready: false, people: SEEDED, current: null };
const listeners = new Set<() => void>();
let cache: UserState | null = null;

function load(): UserState {
  let current: string | null = null;
  let added: string[] = [];
  try {
    current = localStorage.getItem(CURRENT_KEY);
    const parsed = JSON.parse(localStorage.getItem(ADDED_KEY) ?? "[]");
    if (Array.isArray(parsed))
      added = parsed.filter((name): name is string => typeof name === "string");
  } catch {
    // Blocked storage: the picker shows each visit.
  }
  return {
    ready: true,
    people: [...SEEDED, ...added.filter((name) => !SEEDED.includes(name))],
    current,
  };
}

function snapshot() {
  return (cache ??= load());
}

function commit(next: { current?: string | null; added?: string }) {
  try {
    if (next.current === null) localStorage.removeItem(CURRENT_KEY);
    else if (next.current !== undefined)
      localStorage.setItem(CURRENT_KEY, next.current);
    if (next.added) {
      const extra = snapshot().people.filter((name) => !SEEDED.includes(name));
      localStorage.setItem(ADDED_KEY, JSON.stringify([...extra, next.added]));
    }
  } catch {
    // Blocked storage: the choice lasts until the tab closes.
  }
  const now = snapshot();
  cache = {
    ...now,
    current: next.current === undefined ? now.current : next.current,
    people:
      next.added && !now.people.includes(next.added)
        ? [...now.people, next.added]
        : now.people,
  };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the user changes it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === CURRENT_KEY || event.key === ADDED_KEY) {
      cache = load();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The user, and the ways to change them. */
export function useUser() {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  const choose = useCallback((name: string) => commit({ current: name }), []);
  const add = useCallback(
    (name: string) => commit({ added: name.trim(), current: name.trim() }),
    [],
  );
  const leave = useCallback(() => commit({ current: null }), []);
  return {
    ...state,
    /** The name to credit saves to, or "" for a guest or nobody. */
    name: state.current ?? "",
    guest: state.current === GUEST,
    choose,
    add,
    leave,
  };
}
