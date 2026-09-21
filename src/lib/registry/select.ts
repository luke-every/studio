import type { Prototype, Team } from "./types";

/**
 * Selectors over the view model.
 *
 * Pure functions, no I/O, safe on either side of the network boundary — the
 * same sort and filter logic is used by server rendering and by the client
 * store as it applies session changes.
 */

/** When someone last opened a prototype. Per-person, so it is never in the registry. */
export type OpenTimes = Record<string, string>;

export function lastOpened(prototype: Prototype, opened: OpenTimes = {}) {
  return opened[prototype.slug] ?? prototype.updatedAt;
}

export function prototypesInTeam(
  teamSlug: string,
  prototypes: Prototype[],
  opened?: OpenTimes,
) {
  return prototypes
    .filter((prototype) => prototype.teamSlug === teamSlug && !prototype.archived)
    .sort((a, b) => lastOpened(b, opened).localeCompare(lastOpened(a, opened)));
}

export function prototypesInProject(
  projectSlug: string,
  prototypes: Prototype[],
  opened?: OpenTimes,
) {
  return prototypes
    .filter((prototype) => prototype.projectSlug === projectSlug && !prototype.archived)
    .sort((a, b) => lastOpened(b, opened).localeCompare(lastOpened(a, opened)));
}

/** Most recently touched across every team. */
export function latestPrototypes(limit: number, prototypes: Prototype[]) {
  return [...prototypes]
    .filter((prototype) => !prototype.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export type TeamSummary = Team & {
  prototypeCount: number;
  /** Most recent change inside the team, or its creation date if empty. */
  updatedAt: string;
  /** Up to three previews, newest first, used as the team's thumbnail. */
  previews: Prototype["preview"][];
};

export function summariseTeam(team: Team, prototypes: Prototype[]): TeamSummary {
  const contents = prototypesInTeam(team.slug, prototypes);

  return {
    ...team,
    prototypeCount: contents.length,
    updatedAt: contents[0]?.updatedAt ?? team.createdAt,
    previews: contents.slice(0, 3).map((prototype) => prototype.preview),
  };
}
