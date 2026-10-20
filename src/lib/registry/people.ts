import type { Person } from "./types";

/**
 * People are GitHub accounts, so everything about how one is displayed is
 * derived rather than stored. Avatars come straight from GitHub, which means
 * no upload, no storage and no stale copy.
 */

/**
 * Display names for logins that come from somebody's git identity, which is often not what they go by.
 * Keyed by login (the lower-case name with dashes). The login itself never changes, so earlier work
 * stays grouped under the same person. Add a line, deploy, and the old and new work all show the new name.
 */
const ALIASES: Record<string, string> = {
  everyvictor: "Victor",
};

/** The person with their display name, if they have an alias. */
export function aliased<T extends Pick<Person, "login" | "name">>(person: T): T {
  const name = ALIASES[person.login];
  return name ? { ...person, name } : person;
}

export function avatarUrl(person: Pick<Person, "login">, size = 64) {
  return `https://github.com/${person.login}.png?size=${size}`;
}

export function initials(person: Pick<Person, "name" | "login">) {
  const source = person.name.trim() || person.login;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
