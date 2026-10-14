import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { isContentRepoConfigured, readRepoFile, readRepoFileWithSha, RepoConflict, writeRepoFile } from "./github";
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

/**
 * Change the registry. See `updateStoreFile`; `current` is null until the
 * first write.
 */
export const updateRegistryDocument = (
  fn: (current: RegistryDocument | null) => RegistryDocument | Promise<RegistryDocument>,
) =>
  updateStoreFile(REGISTRY_PATH, async (text) => ({
    content: JSON.stringify(await fn(text === null ? null : (JSON.parse(text) as RegistryDocument))),
    message: "Update the registry",
  }));

/**
 * Any other file in the store, by path: comments live beside the registry,
 * not in it, so adding one never rewrites everybody's pages.
 */
export async function readStoreFile(path: string): Promise<string | null> {
  if (localFileMode()) return readFile(join(process.cwd(), ".local", path), "utf8").catch(() => null);
  return readRepoFile(path);
}

const tagOf = (path: string) => `store:${path}`;

/**
 * `readStoreFile` for the polled files (comments, the bell's feed), shared
 * across every tab for a few seconds so N people watching cost one GitHub
 * call per window, not N per poll. A write to the file expires it at once
 * (`updateStoreFile`). Never use it to read for a write: that needs the fresh sha.
 */
export const readStoreFileShared = (path: string) =>
  localFileMode()
    ? readStoreFile(path)
    : unstable_cache(() => readRepoFile(path), [tagOf(path)], { tags: [tagOf(path)], revalidate: 10 })();

/**
 * Read-modify-write a store file without losing anybody else's change.
 * `fn` gets the file's text (null if it isn't there) and returns what to
 * write. The write names the version it was made from; if another write
 * landed first, the file is read again and `fn` runs again on the fresh
 * copy, a few times before giving up. So `fn` must be re-runnable and free of
 * side effects: anything that talks to the outside world belongs after this.
 */
export async function updateStoreFile(
  path: string,
  fn: (text: string | null) => { content: string; message: string } | Promise<{ content: string; message: string }>,
) {
  if (localFileMode()) {
    const file = join(process.cwd(), ".local", path);
    const { content } = await fn(await readFile(file, "utf8").catch(() => null));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
    revalidateTag(tagOf(path), { expire: 0 });
    return;
  }
  for (let attempt = 1; ; attempt++) {
    const current = await readRepoFileWithSha(path);
    const { content, message } = await fn(current?.text ?? null);
    try {
      await writeRepoFile(path, content, message, current?.sha);
      revalidateTag(tagOf(path), { expire: 0 });
      return;
    } catch (error) {
      if (!(error instanceof RepoConflict) || attempt >= 4) throw error;
    }
  }
}
