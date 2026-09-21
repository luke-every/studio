import { people } from "./people";
import { prototypes } from "./prototypes";
import type { Project, Prototype } from "./types";

/**
 * Projects are the top level of the studio: the piece of work a group of
 * prototypes belongs to. Everything else about a project — when it was last
 * touched, how many prototypes it holds, what is in flight — is derived from
 * those prototypes rather than stored twice.
 */
export const seedProjects: Project[] = [
  {
    slug: "onboarding-2026",
    name: "Onboarding",
    client: "Every Foods",
    description:
      "Everything between arriving and understanding what we would send you. The quiz is most of it.",
    status: "active",
    lead: people.luke,
    members: [people.luke, people.mira, people.sarah],
    createdAt: "2026-07-02",
    archived: false,
  },
  {
    slug: "subscription",
    name: "Subscription",
    client: "Every Foods",
    description:
      "The long middle of the relationship: pausing, changing, skipping, coming back.",
    status: "active",
    lead: people.sarah,
    members: [people.sarah, people.tom],
    createdAt: "2026-06-18",
    archived: false,
  },
  {
    slug: "storefront",
    name: "Storefront",
    client: "Every Foods",
    description: "Product pages, and how much of the story belongs next to a price.",
    status: "active",
    lead: people.mira,
    members: [people.mira, people.luke, people.sarah],
    createdAt: "2026-05-30",
    archived: false,
  },
  {
    slug: "lifecycle",
    name: "Lifecycle",
    client: "Every Foods",
    description: "Everything we send when nobody asked us to. Timing, tone and restraint.",
    status: "on-hold",
    lead: people.tom,
    members: [people.tom],
    createdAt: "2026-04-11",
    archived: false,
  },
];

export function prototypesInProject(projectSlug: string, all: Prototype[] = prototypes) {
  return all
    .filter((prototype) => prototype.projectSlug === projectSlug && !prototype.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The most recently touched prototypes across every project. */
export function latestPrototypes(limit = 8, all: Prototype[] = prototypes) {
  return [...all]
    .filter((prototype) => !prototype.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

export type ProjectSummary = Project & {
  prototypeCount: number;
  /** Most recent change inside the project, or its creation date if empty. */
  updatedAt: string;
  /** Up to three previews, newest first, used as the project's thumbnail. */
  previews: Prototype["preview"][];
};

export function summariseProject(
  project: Project,
  all: Prototype[] = prototypes,
): ProjectSummary {
  const contents = prototypesInProject(project.slug, all);

  return {
    ...project,
    prototypeCount: contents.length,
    updatedAt: contents[0]?.updatedAt ?? project.createdAt,
    previews: contents.slice(0, 3).map((prototype) => prototype.preview),
  };
}

export function getProject(slug: string, all: Project[] = seedProjects) {
  return all.find((project) => project.slug === slug);
}
