import type { Project } from "./types";

/**
 * Folders inside a team.
 *
 * They exist because two people often work the same problem from different
 * angles — a designer and a PM circling one question — and that work belongs
 * together without either becoming the other's sub-item.
 */
export const seedProjects: Project[] = [
  {
    slug: "quiz-rework",
    teamSlug: "acquisition",
    name: "Quiz rework",
    createdAt: "2026-08-14",
  },
  {
    slug: "product-page",
    teamSlug: "acquisition",
    name: "Product page",
    createdAt: "2026-07-21",
  },
  {
    slug: "leaving-well",
    teamSlug: "retention",
    name: "Leaving well",
    createdAt: "2026-08-02",
  },
  {
    slug: "saying-something",
    teamSlug: "retention",
    name: "Saying something",
    createdAt: "2026-06-30",
  },
];

/** Which prototypes start out filed into which project. */
export const seedFiling: Record<string, string> = {
  "quiz-results": "quiz-rework",
  "quiz-question-pacing": "quiz-rework",
  "quiz-entry-point": "quiz-rework",
  "ingredient-story": "product-page",
  "pdp-nutrition": "product-page",
  "subscription-pause": "leaving-well",
  "plan-change": "leaving-well",
  "reorder-nudge": "saying-something",
  "winback-note": "saying-something",
};

export function projectsInTeam(teamSlug: string, all: Project[] = seedProjects) {
  return all.filter((project) => project.teamSlug === teamSlug);
}
