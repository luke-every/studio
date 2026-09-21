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

/**
 * A person is a GitHub account. There is no user list to maintain and no
 * accounts to create: whoever signs in is who they are on GitHub.
 *
 * The display name is stored alongside the login rather than looked up,
 * so attribution still reads properly for someone who has left, and so the
 * studio never needs to call GitHub just to render a name. Avatars come
 * from github.com/<login>.png, which needs no storage at all.
 */
export const authorSchema = z.object({
  login: z.string().min(1),
  name: z.string().min(1),
});

/** Who did something, and when. Attached to anything a person causes. */
export const attributionSchema = z.object({
  by: authorSchema,
  at: isoDate,
});

export const teamSchema = z.object({
  slug,
  name: z.string().min(1),
  remit: z.string().default(""),
  description: z.string().default(""),
  status: z.enum(["active", "on-hold", "complete"]),
  lead: authorSchema,
  members: z.array(authorSchema),
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

/**
 * Where something can be looked at: a path served from this deployment
 * (the normal case, since prototypes live in the repository) or a full URL
 * for the occasional thing hosted elsewhere.
 */
const location = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//.test(value),
    "must be a path like /p/slug/ or a full URL",
  );

export const previewSchema = z.object({
  tint: z.tuple([z.string(), z.string()]),
  caption: z.string(),
  /** The prototype itself, served from this deployment. */
  url: location.optional(),
  /** A screenshot committed under public/, referenced by its served path. */
  image: z.string().optional(),
});

/** A divergent design direction. Not a version. */
export const explorationSchema = z.object({
  id: slug,
  title: z.string().min(1),
  premise: z.string().default(""),
  author: authorSchema,
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
  by: authorSchema,
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
  owner: authorSchema,
  collaborators: z.array(authorSchema).default([]),
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
  author: authorSchema,
  createdAt: isoDate,
  preview: previewSchema,
  /**
   * Where this version can be looked at. A deployment is an instance of a
   * version, not a version of its own — redeploying the same state never
   * produces a new version number.
   */
  deployment: z
    .object({
      url: location,
      status: z.enum(["pending", "ready", "failed"]),
    })
    .nullable()
    .default(null),
});

export const teamsFileSchema = z.object({
  teams: z.array(teamSchema),
  projects: z.array(projectSchema),
});

export type AuthorRecord = z.infer<typeof authorSchema>;
export type TeamRecord = z.infer<typeof teamSchema>;
export type ProjectRecord = z.infer<typeof projectSchema>;
export type PrototypeRecord = z.infer<typeof prototypeSchema>;
export type VersionRecord = z.infer<typeof versionSchema>;
export type ExplorationRecord = z.infer<typeof explorationSchema>;
export type PreviewRecord = z.infer<typeof previewSchema>;
export type Attribution = z.infer<typeof attributionSchema>;
