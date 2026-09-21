import type { Person } from "./types";

/**
 * People are GitHub accounts, so everything about how one is displayed is
 * derived rather than stored. Avatars come straight from GitHub, which means
 * no upload, no storage and no stale copy.
 */

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
