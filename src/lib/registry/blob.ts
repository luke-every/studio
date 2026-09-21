import "server-only";

import { head, list, put } from "@vercel/blob";

import type { PrototypeRecord, ProjectRecord, TeamRecord, VersionRecord } from "./schema";

/**
 * The store.
 *
 * Prototypes are content, not code. Keeping them in the repository meant
 * every upload rebuilt and redeployed the whole application — a minute of
 * latency for something the application had nothing to do with, a repository
 * that grew forever, and a merge conflict whenever two people saved at once.
 *
 * So content lives in Vercel Blob and the application only reads it. Nothing
 * is deployed when a prototype is added; the studio simply shows what is
 * there.
 *
 * Two kinds of object:
 *
 *   registry.json                     teams, projects, prototypes, versions
 *   p/<slug>/<version>/index.html     the prototype itself, served by the CDN
 *
 * One registry document rather than an object per record, because a read has
 * to be one request to stay fast. It is small — metadata only, never files.
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
 * Cached by tag rather than by time: a write revalidates it, so a change
 * shows up in seconds without every page view costing a fetch.
 */
export async function readRegistryDocument(): Promise<RegistryDocument> {
  const url = await registryUrl();
  if (!url) return EMPTY_REGISTRY;

  const response = await fetch(url, {
    next: { tags: ["registry"], revalidate: 300 },
  });
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
 * place. Writes are read-modify-write: with a handful of people saving
 * rarely this is fine, and the alternative — an object per record — costs
 * every read a fan-out it does not need.
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

/**
 * Upload a prototype's files. Returns the URL it is served from.
 *
 * Every version gets its own path and is never overwritten, which is what
 * makes going back through the history real rather than nominal.
 */
export async function uploadPrototypeFile(
  slug: string,
  version: string,
  html: ArrayBuffer | string,
): Promise<string> {
  const key = `p/${slug}/${version.replace(".", "-")}/index.html`;

  const existing = await head(key).catch(() => null);
  if (existing) {
    throw new Error(`${version} of ${slug} already exists. Versions are never replaced.`);
  }

  const blob = await put(key, html, {
    access: "public",
    contentType: "text/html; charset=utf-8",
    addRandomSuffix: false,
  });

  return blob.url;
}
