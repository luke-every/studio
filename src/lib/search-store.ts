import type { Prototype } from "./registry/types";

/* ---------------------------------------------------------------------------
 * Matching, for the search that floats over every page.
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
