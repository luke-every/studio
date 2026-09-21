import { z } from "zod";

/**
 * Registry schemas.
 *
 * The registry is the source of truth for what the work *means*. Git remains
 * the source of truth for the code, and nothing here tries to reproduce it.
 *
 * Deliberately small. A prototype is a name, a sentence, and a list of
 * versions — each of which says what changed. Status, tags and a separate
 * design question all came out: they were fields nobody filled in honestly,
 * and an empty field is worse than no field.
 */

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date, YYYY-MM-DD");

/**
 * A person is a GitHub account. There is no user list to maintain: work
 * pushed from Claude Code carries whoever committed it, and work added by
 * hand carries the name typed on the form.
 *
 * The display name travels with the login so attribution still reads
 * properly for someone who has left; avatars come from github.com/<login>.png.
 */
export const authorSchema = z.object({
  login: z.string().min(1),
  name: z.string().min(1),
});

/** Who did something, and when. */
export const attributionSchema = z.object({
  by: authorSchema,
  at: isoDate,
});

export const teamSchema = z.object({
  slug,
  name: z.string().min(1),
  remit: z.string().default(""),
  description: z.string().default(""),
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
 * Where something can be looked at: a path served from this deployment —
 * the normal case, since prototypes live in the repository — or a full URL
 * for the occasional thing hosted elsewhere.
 */
const location = z
  .string()
  .min(1)
  .refine(
    (value) => value.startsWith("/") || /^https?:\/\//.test(value),
    "must be a path like /p/slug/v0-2 or a full URL",
  );

export const previewSchema = z.object({
  /** Two stops used for the placeholder before any files exist. */
  tint: z.tuple([z.string(), z.string()]),
  caption: z.string(),
  /** The prototype itself, served from this deployment. */
  url: location.optional(),
});

/**
 * A saved state of a prototype. Immutable: one file per version, never
 * edited once written. If something changes, it is a new version.
 *
 * Every version keeps its own copy of the files, which is what makes going
 * back through the history real rather than nominal.
 */
export const versionSchema = z.object({
  id: z.string().min(1),
  prototypeSlug: slug,
  /** Chronological label, e.g. "v0.8". Not semver. */
  version: z.string().regex(/^v\d+\.\d+$/, 'must look like "v0.8"'),
  /** A short headline for the change. */
  title: z.string().min(1),
  /** What is new or different, in whatever detail is useful. */
  changes: z.string().default(""),
  author: authorSchema,
  createdAt: isoDate,
  /** This version's own files. Older versions stay viewable. */
  url: location.optional(),
});

export const prototypeSchema = z.object({
  slug,
  teamSlug: slug,
  /** The project folder it is filed into, if any. */
  projectSlug: slug.nullable().default(null),
  name: z.string().min(1),
  description: z.string().default(""),
  owner: authorSchema,
  preview: previewSchema,
  /** The version shown by default. Normally the newest. */
  currentVersion: z.string().min(1),
  created: attributionSchema,
  updatedAt: isoDate,
  archived: z.boolean().default(false),
  /** Where the files live in the repository. */
  repositoryPath: z.string().optional(),
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
export type PreviewRecord = z.infer<typeof previewSchema>;
export type Attribution = z.infer<typeof attributionSchema>;
