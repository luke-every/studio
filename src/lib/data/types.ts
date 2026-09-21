/**
 * Domain model.
 *
 * Deliberately independent of where the data comes from. Today these objects
 * are hand-written fixtures; when the GitHub layer lands it will produce the
 * same shapes, and no component will change.
 */

export type PrototypeStatus = "exploring" | "in-review" | "shipped" | "parked";

export type Person = {
  id: string;
  name: string;
  initials: string;
};

export type PrototypeVersion = {
  /** Human version, e.g. "v0.8". Never a commit hash. */
  id: string;
  title: string;
  /** One line on what changed. */
  summary: string;
  /** The reasoning — why this exploration was worth making. */
  why: string;
  author: Person;
  /** ISO date. */
  date: string;
  preview: PreviewSource;
};

export type Exploration = {
  id: string;
  title: string;
  /** How this branch differs in intent, not in implementation. */
  premise: string;
  author: Person;
  preview: PreviewSource;
  versions: PrototypeVersion[];
};

/**
 * A preview is an object the interface can move around and expand, so it
 * carries everything needed to render it at any size: a gradient stand-in
 * today, a live prototype URL once the data layer exists.
 */
export type PreviewSource = {
  /** Two warm stops used for the placeholder surface. */
  tint: [string, string];
  /** Short label drawn into the placeholder. */
  caption: string;
  /** Live prototype URL, when one exists. */
  url?: string;
};

export type TeamStatus = "active" | "on-hold" | "complete";

/**
 * A team is how the studio is grouped: the part of the business the work
 * belongs to. Prototypes belong to exactly one team, and the overview is a
 * view of teams first.
 */
export type Team = {
  slug: string;
  name: string;
  /** What this team is responsible for, in a few words. */
  remit: string;
  description: string;
  status: TeamStatus;
  lead: Person;
  members: Person[];
  createdAt: string;
  archived: boolean;
};

/**
 * A project is a folder inside a team: a way to keep related work together
 * when several people are circling the same problem from different angles.
 * A prototype may sit in one project, or in none.
 */
export type Project = {
  slug: string;
  teamSlug: string;
  name: string;
  createdAt: string;
};

export type Prototype = {
  slug: string;
  /** The team this prototype belongs to. */
  teamSlug: string;
  /** The project inside that team, when it has been filed into one. */
  projectSlug?: string | null;
  /** When someone last opened it. Falls back to updatedAt when unknown. */
  lastOpenedAt?: string;
  name: string;
  description: string;
  /** The question this prototype exists to answer. */
  designQuestion: string;
  owner: Person;
  collaborators: Person[];
  status: PrototypeStatus;
  /** ISO date of the most recent change. */
  updatedAt: string;
  archived: boolean;
  tags: string[];
  preview: PreviewSource;
  /** The exploration currently considered the main line of work. */
  currentExplorationId: string;
  explorations: Exploration[];
  /** Background a newcomer needs before looking at the prototype. */
  context: string;
};
