import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isContentRepoConfigured, readRepoFile, writeRepoFile } from "./github";
import type { PrototypeRecord, ProjectRecord, TeamRecord, VersionRecord } from "./schema";

/**
 * The registry document.
 *
 * Teams, projects, prototypes and versions — metadata only, never files. A
 * prototype's own files sit beside it in the content repository; this is
 * just the record of what exists and what it means.
 *
 * One document rather than a file per record, because a read has to be one
 * request to stay fast. Writes are read-modify-write: with a handful of
 * people saving rarely this is fine.
 *
 * It lives at the root of the content repository, so the studio has one
 * store to set up, not two.
 */

const REGISTRY_PATH = "registry.json";

export type RegistryDocument = {
  teams: TeamRecord[];
  projects: ProjectRecord[];
  prototypes: PrototypeRecord[];
  versions: VersionRecord[];
};

/**
 * With no content repository connected, `next dev` keeps the registry in a
 * file on this machine so the studio can be worked on end to end. Never in
 * production, where nothing is saved without the repository.
 */
const LOCAL_PATH = join(process.cwd(), ".local", "registry.json");
const localFileMode = () => !isContentRepoConfigured() && process.env.NODE_ENV !== "production";

export const isStoreConfigured = () => isContentRepoConfigured() || localFileMode();

/**
 * Read the registry, fresh every time. The pages that read it are
 * prerendered, so this runs when a page is generated, not when somebody
 * looks at one — and a cached copy would put a stale registry in front of
 * the version /push has just recorded.
 *
 * Null when nothing has been written yet; the caller falls back to the seed.
 */
export async function readRegistryDocument(): Promise<RegistryDocument | null> {
  const text = localFileMode()
    ? await readFile(LOCAL_PATH, "utf8").catch(() => null)
    : await readRepoFile(REGISTRY_PATH);
  return text === null ? null : (JSON.parse(text) as RegistryDocument);
}

export async function writeRegistryDocument(document: RegistryDocument) {
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (localFileMode()) {
    await mkdir(dirname(LOCAL_PATH), { recursive: true });
    await writeFile(LOCAL_PATH, text);
    return;
  }
  await writeRepoFile(REGISTRY_PATH, text, "Update the registry");
}
