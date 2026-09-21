"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { Prototype } from "./registry/types";
import type { TeamSummary } from "./registry/select";

/**
 * Search is one piece of state for the whole studio, not a widget on a page.
 *
 * The field lives in the nav and the results appear wherever the user
 * already is, so searching never feels like leaving the place they were
 * looking at.
 */
type SearchContextValue = {
  query: string;
  setQuery: (query: string) => void;
  clear: () => void;
  /** Lets any surface put the cursor in the field — e.g. an empty state. */
  register: (input: HTMLInputElement | null) => void;
  focus: () => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const field = useRef<HTMLInputElement | null>(null);

  const clear = useCallback(() => setQuery(""), []);
  const register = useCallback((input: HTMLInputElement | null) => {
    field.current = input;
  }, []);
  const focus = useCallback(() => field.current?.focus(), []);

  const value = useMemo(
    () => ({ query, setQuery, clear, register, focus }),
    [query, clear, register, focus],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearch must be used inside SearchProvider");
  return context;
}

/* ---------------------------------------------------------------------------
 * Matching
 *
 * Deliberately generous: a prototype matches on anything someone might
 * remember about it, including what a particular version changed — that is
 * often the only wording anybody recalls.
 * ------------------------------------------------------------------------- */

function normalise(value: string) {
  return value.toLowerCase().trim();
}

export function matchesPrototype(prototype: Prototype, query: string) {
  const q = normalise(query);
  if (!q) return true;

  const haystack = [
    prototype.name,
    prototype.description,
    prototype.owner.name,
    ...prototype.versions.flatMap((version) => [
      version.version,
      version.title,
      version.changes,
      version.author.name,
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return q.split(/\s+/).every((term) => haystack.includes(term));
}

export function matchesTeam(team: TeamSummary, query: string) {
  const q = normalise(query);
  if (!q) return true;
  const haystack = `${team.name} ${team.remit} ${team.description}`.toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}
