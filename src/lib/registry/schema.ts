import { z } from "zod";

/**
 * Registry schemas.
 *
 * The registry is the source of truth for what the work *means* — who owns
 * it, what it is exploring, which direction is current. Git remains the
 * source of truth for the code itself, and nothing here tries to reproduce
 * it: a version does not store a commit SHA, because the commit that
 * introduced the version file is the version.
 *
 * Every read goes through these schemas, so bad data fails loudly at load
 * rather than surfacing as a quietly wrong history in the interface.
 */

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date, YYYY-MM-DD");

/** A person. Identity is the id — names change, ids do not. */
export const userSchema = z.object({
  id: slug,
  name: z.string().min(1),
  email: z.string().email(),
  initials: z.string().min(1).max(3),
  /** Whether they are still on the team. Past work keeps its attribution. */
  active: z.boolean().default(true),
});

/** Who did something, and when. Attached to anything a person causes. */
export const attributionSchema = z.object({
  by: slug,
  at: isoDate,
});

export const teamSchema = z.object({
  slug,
  name: z.string().min(1),
  remit: z.string().default(""),
  description: z.string().default(""),
  status: z.enum(["active", "on-hold", "complete"]),
  leadId: slug,
  memberIds: z.array(slug),
  created: attributionSchema,
  archived: z.boolean().default(false),
});

/** A folder inside a team. Filing is optional and reversible. */
export const projectSchema = z.object({
  slug,
  teamSlug: slug,
  name: z.string().min(1),
  created: attributionSchema,
});

export const previewSchema = z.object({
  tint: z.tuple([z.string(), z.string()]),
  caption: z.string(),
  /** A live prototype, once one exists. */
  url: z.string().url().optional(),
  /** A captured screenshot, once the capture pipeline exists. */
  image: z.string().optional(),
});

/** A divergent design direction. Not a version. */
export const explorationSchema = z.object({
  id: slug,
  title: z.string().min(1),
  premise: z.string().default(""),
  authorId: slug,
  status: z.enum(["active", "review", "selected", "archived"]).default("active"),
  /** Exploration branch in git, when the work has one. */
  branch: z.string().optional(),
  preview: previewSchema,
});

/**
 * The current direction: which exploration the team considers live, and
 * which saved version within it. Explicitly chosen — never "the latest
 * commit" — so someone can be mid-experiment without changing what the team
 * regards as current.
 */
export const selectionSchema = z.object({
  explorationId: slug,
  versionId: z.string().min(1),
  by: slug,
  at: isoDate,
});

export const prototypeSchema = z.object({
  slug,
  teamSlug: slug,
  /** The project folder it is filed into, if any. */
  projectSlug: slug.nullable().default(null),
  name: z.string().min(1),
  description: z.string().default(""),
  designQuestion: z.string().default(""),
  context: z.string().default(""),
  ownerId: slug,
  collaboratorIds: z.array(slug).default([]),
  status: z.enum(["exploring", "in-review", "shipped", "parked"]),
  tags: z.array(z.string()).default([]),
  preview: previewSchema,
  explorations: z.array(explorationSchema).min(1),
  selected: selectionSchema,
  created: attributionSchema,
  updatedAt: isoDate,
  archived: z.boolean().default(false),
  /** Where the code lives, once prototypes are real apps in the repo. */
  repositoryPath: z.string().optional(),
  figmaUrl: z.string().url().optional(),
});

/**
 * A saved state of an exploration. Immutable: one file per version, never
 * edited once written. If something changes, it is a new version.
 */
export const versionSchema = z.object({
  id: z.string().min(1),
  prototypeSlug: slug,
  explorationId: slug,
  /** Chronological prototype numbering, e.g. "v0.8". Not semver. */
  version: z.string().regex(/^v\d+\.\d+$/, 'must look like "v0.8"'),
  title: z.string().min(1),
  summary: z.string().default(""),
  why: z.string().default(""),
  authorId: slug,
  createdAt: isoDate,
  preview: previewSchema,
  /**
   * Where this version can be looked at. A deployment is an instance of a
   * version, not a version of its own — redeploying the same state never
   * produces a new version number.
   */
  deployment: z
    .object({
      url: z.string().url(),
      status: z.enum(["pending", "ready", "failed"]),
    })
    .nullable()
    .default(null),
});

export const usersFileSchema = z.object({ users: z.array(userSchema) });
export const teamsFileSchema = z.object({
  teams: z.array(teamSchema),
  projects: z.array(projectSchema),
});

export type UserRecord = z.infer<typeof userSchema>;
export type TeamRecord = z.infer<typeof teamSchema>;
export type ProjectRecord = z.infer<typeof projectSchema>;
export type PrototypeRecord = z.infer<typeof prototypeSchema>;
export type VersionRecord = z.infer<typeof versionSchema>;
export type ExplorationRecord = z.infer<typeof explorationSchema>;
export type PreviewRecord = z.infer<typeof previewSchema>;
export type Attribution = z.infer<typeof attributionSchema>;
