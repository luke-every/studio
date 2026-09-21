import type { Person } from "./types";

export const people = {
  luke: { id: "luke", name: "Luke", initials: "LK" },
  sarah: { id: "sarah", name: "Sarah", initials: "SA" },
  mira: { id: "mira", name: "Mira", initials: "MI" },
  tom: { id: "tom", name: "Tom", initials: "TO" },
} as const satisfies Record<string, Person>;

/** Who is looking. Replaced by real auth when the data layer lands. */
export const currentPersonId = "luke";
