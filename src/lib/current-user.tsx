"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { Person } from "@/lib/registry/types";

/**
 * Who is using the studio.
 *
 * There is no authentication yet, so the person identifies themselves and
 * the choice is remembered in this browser. That is enough to attribute
 * work — who created a team, who filed a prototype, who selected a
 * direction — which is the point: shared links are useless if nobody can
 * tell who did what.
 *
 * When real sign-in arrives it replaces this provider and nothing that
 * consumes `useCurrentUser` changes.
 */
const STORAGE_KEY = "proto.current-user";

type CurrentUserValue = {
  user: Person;
  users: Person[];
  setUser: (id: string) => void;
};

const CurrentUserContext = createContext<CurrentUserValue | null>(null);

let cached: string | null = null;
const listeners = new Set<() => void>();

function read(): string | null {
  if (cached !== null) return cached;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

function write(id: string) {
  cached = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Blocked storage: the choice lasts for this page only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function CurrentUserProvider({
  users,
  children,
}: {
  users: Person[];
  children: ReactNode;
}) {
  const storedId = useSyncExternalStore(subscribe, read, () => null);
  const user = users.find((candidate) => candidate.id === storedId) ?? users[0];

  const setUser = useCallback((id: string) => write(id), []);

  const value = useMemo(() => ({ user, users, setUser }), [user, users, setUser]);

  return (
    <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>
  );
}

export function useCurrentUser() {
  const context = useContext(CurrentUserContext);
  if (!context) throw new Error("useCurrentUser must be used inside CurrentUserProvider");
  return context;
}
