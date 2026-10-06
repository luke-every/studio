/**
 * The view model.
 *
 * What the interface consumes. Plain serialisable data, so it can cross the
 * server/client boundary, and deliberately close to the registry shape —
 * there is little left to resolve now that people are stored where they act.
 */

export type Person = {
  login: string;
  name: string;
};

export type PreviewSource = {
  tint: [string, string];
  caption: string;
  url?: string;
};

/** A saved state of a prototype. Immutable once written. */
export type PrototypeVersion = {
  id: string;
  /** Chronological label, e.g. "v0.8" — what people see, and can rename. */
  version: string;
  /** The version the files are stored under. Differs from `version` only after a rename. */
  key: string;
  title: string;
  /** What is new or different in this version. */
  changes: string;
  author: Person;
  createdAt: string;
  /** Where the studio serves this version from, on its own domain. */
  url?: string;
  /** Where the file actually lives in the store. */
  fileUrl?: string;
};

export type Prototype = {
  slug: string;
  teamSlug: string;
  projectSlug: string | null;
  name: string;
  description: string;
  owner: Person;
  preview: PreviewSource;
  /** Newest first. */
  versions: PrototypeVersion[];
  /** The version shown by default. */
  current: PrototypeVersion;
  createdBy: Person;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  figmaUrl?: string;
  notionUrl?: string;
  repositoryPath?: string;
};

export type Team = {
  slug: string;
  name: string;
  remit: string;
  description: string;
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

export type RegistrySnapshot = {
  /** Everyone who appears anywhere in the registry. Derived, never managed. */
  people: Person[];
  teams: Team[];
  projects: Project[];
  prototypes: Prototype[];
};
