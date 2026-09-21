import { people } from "./people";
import { prototypes } from "./prototypes";
import type { Prototype, Team } from "./types";

/**
 * Teams are the top level of the studio. Everything else about a team — when
 * it was last touched, how much is in it, what it looks like — is derived
 * from the prototypes inside it rather than stored twice.
 */
export const seedTeams: Team[] = [
  {
    slug: "acquisition",
    name: "Acquisition",
    remit: "Arriving and deciding",
    description:
      "Everything between landing on us for the first time and understanding what we would send you.",
    status: "active",
    lead: people.luke,
    members: [people.luke, people.mira, people.sarah],
    createdAt: "2026-05-30",
    archived: false,
  },
  {
    slug: "retention",
    name: "Retention",
    remit: "Staying, pausing, coming back",
    description:
      "The long middle of the relationship. Changing a plan, taking a break, and everything we send when nobody asked.",
    status: "active",
    lead: people.sarah,
    members: [people.sarah, people.tom],
    createdAt: "2026-04-11",
    archived: false,
  },
  {
    slug: "playground",
    name: "Playground",
    remit: "No brief, no promises",
    description:
      "Work with nothing riding on it. Some of it becomes real. Most of it is here to settle an argument.",
    status: "active",
    lead: people.mira,
    members: [people.mira, people.tom, people.luke],
    createdAt: "2026-08-02",
    archived: false,
  },
];

/** When someone last opened a prototype, falling back to its last change. */
export function lastOpened(prototype: Prototype) {
  return prototype.lastOpenedAt ?? prototype.updatedAt;
}

/** Everything in a team, most recently opened first. */
export function prototypesInTeam(teamSlug: string, all: Prototype[] = prototypes) {
  return all
    .filter((prototype) => prototype.teamSlug === teamSlug && !prototype.archived)
    .sort((a, b) => lastOpened(b).localeCompare(lastOpened(a)));
}

export function prototypesInProject(projectSlug: string, all: Prototype[] = prototypes) {
  return all
    .filter((prototype) => prototype.projectSlug === projectSlug && !prototype.archived)
    .sort((a, b) => lastOpened(b).localeCompare(lastOpened(a)));
}

/** The most recently touched prototypes across every team. */
export function latestPrototypes(limit = 8, all: Prototype[] = prototypes) {
  return [...all]
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

export function summariseTeam(team: Team, all: Prototype[] = prototypes): TeamSummary {
  const contents = prototypesInTeam(team.slug, all);

  return {
    ...team,
    prototypeCount: contents.length,
    updatedAt: contents[0]?.updatedAt ?? team.createdAt,
    previews: contents.slice(0, 3).map((prototype) => prototype.preview),
  };
}

export function getTeam(slug: string, all: Team[] = seedTeams) {
  return all.find((team) => team.slug === slug);
}
