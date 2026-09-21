/**
 * The view model.
 *
 * What the interface consumes: registry records with their references
 * resolved — people instead of ids, versions attached to the exploration
 * they belong to, the selected direction resolved to real objects. Plain
 * serialisable data, so it can cross the server/client boundary.
 *
 * Components depend on these types and never on the registry file format.
 */

/**
 * A person is a GitHub account. Nothing else is stored about them — initials
 * and avatars are derived from the login (see ./people).
 */
export type Person = {
  login: string;
  name: string;
};

export type PreviewSource = {
  tint: [string, string];
  caption: string;
  url?: string;
  image?: string;
};

export type Deployment = {
  url: string;
  status: "pending" | "ready" | "failed";
};

/** A saved state of an exploration. Immutable once written. */
export type PrototypeVersion = {
  id: string;
  /** Chronological label, e.g. "v0.8". */
  version: string;
  title: string;
  summary: string;
  why: string;
  author: Person;
  createdAt: string;
  preview: PreviewSource;
  deployment: Deployment | null;
};

/** A divergent design direction. Not a version. */
export type Exploration = {
  id: string;
  title: string;
  premise: string;
  author: Person;
  status: "active" | "review" | "selected" | "archived";
  branch?: string;
  preview: PreviewSource;
  /** Newest first. */
  versions: PrototypeVersion[];
};

export type PrototypeStatus = "exploring" | "in-review" | "shipped" | "parked";

export type Prototype = {
  slug: string;
  teamSlug: string;
  /** The project folder it is filed into, if any. */
  projectSlug: string | null;
  name: string;
  description: string;
  designQuestion: string;
  context: string;
  owner: Person;
  collaborators: Person[];
  status: PrototypeStatus;
  tags: string[];
  preview: PreviewSource;
  explorations: Exploration[];
  /**
   * The team's current direction. Explicitly chosen, never "the latest
   * commit" — someone can be mid-experiment without changing what the team
   * regards as current.
   */
  selected: {
    exploration: Exploration;
    version: PrototypeVersion;
    by: Person;
    at: string;
  };
  createdBy: Person;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  repositoryPath?: string;
  figmaUrl?: string;
};

export type TeamStatus = "active" | "on-hold" | "complete";

export type Team = {
  slug: string;
  name: string;
  remit: string;
  description: string;
  status: TeamStatus;
  lead: Person;
  members: Person[];
  createdBy: Person;
  createdAt: string;
  archived: boolean;
};

export type Project = {
  slug: string;
  teamSlug: string;
  name: string;
  createdBy: Person;
  createdAt: string;
};

/** Everything the interface needs, resolved in one pass. */
export type RegistrySnapshot = {
  /** Everyone who appears anywhere in the registry. Derived, never managed. */
  people: Person[];
  teams: Team[];
  projects: Project[];
  prototypes: Prototype[];
};
