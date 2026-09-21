import "server-only";

import { revalidateTag } from "next/cache";

import {
  isBlobConfigured,
  readRegistryDocument,
  uploadPrototypeFile,
  writeRegistryDocument,
  type RegistryDocument,
} from "./blob";
import { readSeed } from "./read";
import { prototypeSchema, versionSchema } from "./schema";
import type { PrototypeRecord, VersionRecord } from "./schema";

/**
 * Changing the registry.
 *
 * Read the document, apply one change, validate the result against the same
 * schemas the application reads through, write it back. Nothing is deployed:
 * a change is live as soon as the cache is revalidated, which happens here.
 *
 * Validating before writing is what keeps one bad change from becoming a
 * broken studio for everybody.
 */

export class StoreError extends Error {}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(name: string, fallback: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || `${fallback}-${Date.now()}`;
}

/**
 * The person, as stored.
 *
 * There are no accounts, so authorship is whatever name was given — by the
 * person at the keyboard, or by Claude Code from the local git identity.
 * A login is derived so avatars and grouping have something stable to key on.
 */
function named(name: string | undefined, fallback = "Someone") {
  const trimmed = name?.trim() || fallback;
  return { login: slugify(trimmed, "person"), name: trimmed };
}

async function load(): Promise<RegistryDocument> {
  if (!isBlobConfigured()) {
    throw new StoreError(
      "No storage is connected, so nothing can be saved. Connect a Blob store in Vercel.",
    );
  }
  // First write into a fresh store starts from the seed, so the teams that
  // ship with the studio exist without anybody running a migration.
  return (await readRegistryDocument()) ?? readSeed();
}

async function save(document: RegistryDocument) {
  await writeRegistryDocument(document);
  // The studio reads through this tag, so the change is visible at once
  // rather than whenever the cache happened to expire.
  revalidateTag("registry", { expire: 0 });
}

export async function createTeam(input: {
  name: string;
  remit: string;
  description: string;
  /** Optional: nobody signs in, and a team is not work anybody claims. */
  by?: string;
}) {
  const document = await load();
  const slug = slugify(input.name, "team");

  if (document.teams.some((team) => team.slug === slug)) {
    throw new StoreError(`There is already a team called "${input.name}".`);
  }

  const person = named(input.by, "Prototype Studio");
  document.teams.push({
    slug,
    name: input.name.trim(),
    remit: input.remit.trim(),
    description: input.description.trim(),
    lead: person,
    members: [person],
    created: { by: person, at: today() },
    archived: false,
  });

  await save(document);
  return slug;
}

export async function createProject(input: {
  teamSlug: string;
  name: string;
  by?: string;
}) {
  const document = await load();
  const slug = slugify(input.name, "project");

  if (!document.teams.some((team) => team.slug === input.teamSlug)) {
    throw new StoreError(`No team called "${input.teamSlug}".`);
  }
  if (document.projects.some((project) => project.slug === slug)) {
    throw new StoreError(`There is already a project called "${input.name}".`);
  }

  document.projects.push({
    slug,
    teamSlug: input.teamSlug,
    name: input.name.trim(),
    created: { by: named(input.by, "Prototype Studio"), at: today() },
  });

  await save(document);
  return slug;
}

export async function filePrototype(input: {
  prototypeSlug: string;
  projectSlug: string | null;
}) {
  const document = await load();
  const prototype = document.prototypes.find((item) => item.slug === input.prototypeSlug);
  if (!prototype) throw new StoreError(`No prototype called "${input.prototypeSlug}".`);

  prototype.projectSlug = input.projectSlug;
  prototypeSchema.parse(prototype);

  await save(document);
}

/** "v0.10" follows "v0.9", which a string sort would get backwards. */
function nextVersion(existing: VersionRecord[]) {
  const highest = existing.reduce((top, version) => {
    const value = Number(version.version.replace(/^v/, ""));
    return Number.isNaN(value) ? top : Math.max(top, value);
  }, 0);
  return `v${(highest + 0.1).toFixed(1)}`;
}

/**
 * Save a version.
 *
 * Creates the prototype if this is the first one. The files are uploaded to
 * their own path and never replaced, so every version stays viewable — that
 * is what makes the history real rather than nominal.
 */
export async function saveVersion(input: {
  name: string;
  slug?: string;
  teamSlug?: string;
  projectSlug?: string | null;
  description?: string;
  title?: string;
  changes?: string;
  by: string;
  html: ArrayBuffer | string;
  tint?: [string, string];
}) {
  const document = await load();
  const slug = slugify(input.slug ?? input.name, "prototype");
  const person = named(input.by);

  const existing = document.prototypes.find((prototype) => prototype.slug === slug);
  const mine = document.versions.filter((version) => version.prototypeSlug === slug);

  if (!existing) {
    if (!input.teamSlug) {
      throw new StoreError(`"${input.name}" is new, so it needs a team.`);
    }
    if (!document.teams.some((team) => team.slug === input.teamSlug)) {
      throw new StoreError(`No team called "${input.teamSlug}".`);
    }
  }

  const version = nextVersion(mine);
  const versionId = `${slug}-${version}`;
  const url = await uploadPrototypeFile(slug, version, input.html);

  const record: VersionRecord = versionSchema.parse({
    id: versionId,
    prototypeSlug: slug,
    version,
    title: input.title?.trim() || (version === "v0.1" ? "First version" : `Version ${version}`),
    changes: input.changes?.trim() ?? "",
    author: person,
    createdAt: today(),
    url,
  });
  document.versions.push(record);

  const preview = {
    tint: input.tint ?? existing?.preview.tint ?? (["#e8e6e1", "#8b8880"] as [string, string]),
    caption: input.name.trim(),
    url,
  };

  if (existing) {
    existing.preview = preview;
    existing.currentVersion = versionId;
    existing.updatedAt = today();
    if (input.description?.trim()) existing.description = input.description.trim();
    prototypeSchema.parse(existing);
  } else {
    const prototype: PrototypeRecord = prototypeSchema.parse({
      slug,
      teamSlug: input.teamSlug,
      projectSlug: input.projectSlug ?? null,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      owner: person,
      preview,
      currentVersion: versionId,
      created: { by: person, at: today() },
      updatedAt: today(),
      archived: false,
    });
    document.prototypes.push(prototype);
  }

  await save(document);
  return { slug, version, url };
}
