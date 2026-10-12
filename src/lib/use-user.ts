"use client";

import { useCallback, useSyncExternalStore } from "react";

import { AVATAR_COLORS, AVATAR_COUNT, defaultProfile, type Profile } from "./avatars";

/**
 * Who is using the studio on this browser. Nobody signs in — this is a name
 * picked from a short list, kept in localStorage, and used to credit what you
 * save. Each person also has a face and a colour, which they can change. A
 * guest is somebody who chose not to say.
 */
export const GUEST = "";
const SEEDED = ["Luke", "Victor"];
const CURRENT_KEY = "studio.user";
const PEOPLE_KEY = "studio.people";
/** Names added before people had faces. */
const LEGACY_KEY = "studio.users";

export type UserState = {
  /** False until the browser has been read; the server renders with it false. */
  ready: boolean;
  /** The people on offer, each with their face and colour. */
  people: Profile[];
  /** The chosen name, GUEST for a guest, null if nobody has chosen yet. */
  current: string | null;
};

const SERVER: UserState = { ready: false, people: SEEDED.map(defaultProfile), current: null };
const listeners = new Set<() => void>();
let cache: UserState | null = null;

function isProfile(value: unknown): value is Profile {
  const profile = value as Profile;
  return (
    !!profile &&
    typeof profile.name === "string" &&
    !!profile.name &&
    Number.isInteger(profile.avatar) &&
    profile.avatar >= 0 &&
    profile.avatar < AVATAR_COUNT &&
    Number.isInteger(profile.color) &&
    profile.color >= 0 &&
    profile.color < AVATAR_COLORS.length
  );
}

function load(): UserState {
  let current: string | null = null;
  let people: Profile[] | null = null;
  let legacy: string[] = [];
  try {
    current = localStorage.getItem(CURRENT_KEY);
    const stored = JSON.parse(localStorage.getItem(PEOPLE_KEY) ?? "null");
    if (Array.isArray(stored)) people = stored.filter(isProfile);
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "[]");
    if (Array.isArray(old)) legacy = old.filter((name): name is string => typeof name === "string");
  } catch {
    // Blocked storage: the picker shows each visit.
  }
  return {
    ready: true,
    people: people ?? [...SEEDED, ...legacy.filter((name) => !SEEDED.includes(name))].map(defaultProfile),
    current,
  };
}

function snapshot() {
  return (cache ??= load());
}

function commit(next: { current?: string | null; people?: Profile[] }) {
  try {
    if (next.current === null) localStorage.removeItem(CURRENT_KEY);
    else if (next.current !== undefined) localStorage.setItem(CURRENT_KEY, next.current);
    if (next.people) localStorage.setItem(PEOPLE_KEY, JSON.stringify(next.people));
  } catch {
    // Blocked storage: the choice lasts until the tab closes.
  }
  const now = snapshot();
  cache = {
    ...now,
    current: next.current === undefined ? now.current : next.current,
    people: next.people ?? now.people,
  };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changing the user changes it here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === CURRENT_KEY || event.key === PEOPLE_KEY) {
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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The user, and the ways to change them. */
export function useUser() {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  const choose = useCallback((name: string) => commit({ current: name }), []);

  /** Add somebody and become them. Returns what is wrong with it, or null. */
  const add = useCallback((profile: Profile) => {
    const name = profile.name.trim();
    if (!name) return "Add a name.";
    const people = snapshot().people;
    if (people.some((person) => same(person.name, name))) return `There is already somebody called ${name}.`;
    commit({ people: [...people, { ...profile, name }], current: name });
    return null;
  }, []);

  /** Change somebody's name, face or colour. Returns what is wrong with it, or null. */
  const update = useCallback((was: string, profile: Profile) => {
    const name = profile.name.trim();
    if (!name) return "Add a name.";
    const { people, current } = snapshot();
    if (people.some((person) => person.name !== was && same(person.name, name))) return `There is already somebody called ${name}.`;
    const next = { ...profile, name };
    commit({
      people: people.some((person) => person.name === was) ? people.map((person) => (person.name === was ? next : person)) : [...people, next],
      current: current === was ? name : current,
    });
    return null;
  }, []);

  const leave = useCallback(() => commit({ current: null }), []);
  /** How somebody looks: what they chose, else what their name works out to. */
  const profileOf = useCallback((name: string) => state.people.find((person) => person.name === name) ?? defaultProfile(name), [state.people]);

  return {
    ...state,
    /** The name to credit saves to, or "" for a guest or nobody. */
    name: state.current ?? "",
    guest: state.current === GUEST,
    choose,
    add,
    update,
    leave,
    profileOf,
  };
}
