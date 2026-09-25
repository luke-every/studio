import "server-only";

import { list, put } from "@vercel/blob";

import type { PrototypeRecord, ProjectRecord, TeamRecord, VersionRecord } from "./schema";

/**
 * The registry document.
 *
 * Teams, projects, prototypes and versions — metadata only, never files. A
 * prototype's own files live in the content repository (`github.ts`); this
 * is just the record of what exists and what it means.
 *
 * One document rather than an object per record, because a read has to be
 * one request to stay fast. Writes are read-modify-write: with a handful of
 * people saving rarely this is fine, and the alternative — an object per
 * record — costs every read a fan-out it does not need.
 */

const REGISTRY_KEY = "registry.json";

export type RegistryDocument = {
  teams: TeamRecord[];
  projects: ProjectRecord[];
  prototypes: PrototypeRecord[];
  versions: VersionRecord[];
};

export const EMPTY_REGISTRY: RegistryDocument = {
  teams: [],
  projects: [],
  prototypes: [],
  versions: [],
};

export function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Where the registry document currently lives. Blob URLs contain a random
 * suffix, so the key alone is not enough to fetch one.
 */
async function registryUrl(): Promise<string | null> {
  const { blobs } = await list({ prefix: REGISTRY_KEY, limit: 1 });
  return blobs[0]?.url ?? null;
}

/**
 * Read the registry.
 *
 * Read fresh, every time. The document is a few kilobytes of metadata, and
 * the pages that read it are prerendered — so this runs when a page is
 * generated, not when somebody looks at one.
 *
 * It used to be cached by tag, which put a stale registry in front of every
 * reader: a push wrote the new version, the pages were regenerated, and they
 * were regenerated from the cached copy that did not have it yet. A
 * prototype took the cache's five minutes to appear rather than the seconds
 * /push promises. Caching the document bought nothing that prerendering had
 * not already bought, and cost the one thing the studio has to get right.
 */
export async function readRegistryDocument(): Promise<RegistryDocument | null> {
  const url = await registryUrl();
  // Nothing written yet. The caller falls back to the seed, which is how a
  // fresh store gets its teams without a migration step.
  if (!url) return null;

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not read the registry (${response.status}).`);
  }

  return (await response.json()) as RegistryDocument;
}

/**
 * Replace the registry document.
 *
 * `allowOverwrite` keeps the key stable so the URL does not change, and
 * `addRandomSuffix: false` is what makes the key predictable in the first
 * place.
 */
export async function writeRegistryDocument(document: RegistryDocument) {
  await put(REGISTRY_KEY, `${JSON.stringify(document, null, 2)}\n`, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}
