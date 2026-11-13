import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * What a Claude run changed in a prototype's folder, kept so the studio can put it back itself, without Claude.
 *
 * Claude Code doesn't say which files it touched, so the folder is looked at before the run and again after it
 * (`snapshot`, then `changesSince`). Only what differs is kept: each changed file as it was and as it became, beside a
 * list saying which is which. `put` then sets those files to one or the other, and only if every one of them is still
 * exactly as the other left it: a file somebody has worked on since is never written over, and nothing is done by halves.
 *
 * The limits are on purpose. A file over `CAP` isn't copied (a prototype can hold large media), so a run that changes
 * one can't be undone and none is offered. Whatever else changes in the folder while Claude works counts as Claude's.
 * Folders that are built or installed rather than written (`SKIP`, and any starting with a dot) aren't looked at.
 */

/** The largest file a copy is kept of. */
const CAP = 1024 * 1024;
const SKIP = new Set(["node_modules", "out", "dist", "build"]);

/** One file a run changed: what it held before and after, as hashes. Null is a file that wasn't there. */
export type FileChange = { path: string; before: string | null; after: string | null };

/** A file as it was seen: what it holds, or for one too big to read, only its size and when it was last written. */
type Seen = { hash: string } | { big: string };

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const hashOf = (file: string) => readFile(file).then(sha, () => null);

async function walk(folder: string, under = ""): Promise<string[]> {
  const entries = await readdir(join(folder, under), { withFileTypes: true });
  const found = await Promise.all(
    entries.map((entry) => {
      const path = under ? `${under}/${entry.name}` : entry.name;
      return entry.isDirectory() ? walk(folder, path) : entry.isFile() ? [path] : [];
    }),
  );
  return found.flat();
}

/** The files worth looking at: what git would track or add, if the folder is in a repository, else everything in it; never what is built, installed or the studio's own. */
async function filesOf(folder: string) {
  const listed = await run("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: folder, maxBuffer: 64 * 1024 * 1024 }).then(
    ({ stdout }) => stdout.split("\0").filter(Boolean),
    () => null,
  );
  const written = (path: string) => !path.split("/").slice(0, -1).some((part) => part.startsWith(".") || SKIP.has(part));
  return (listed ?? (await walk(folder))).filter(written);
}

async function look(file: string): Promise<{ seen: Seen; bytes?: Buffer; written: number } | null> {
  const stats = await lstat(file).catch(() => null);
  if (!stats?.isFile()) return null;
  if (stats.size > CAP) return { seen: { big: `${stats.size}:${stats.mtimeMs}` }, written: stats.mtimeMs };
  const bytes = await readFile(file);
  return { seen: { hash: sha(bytes) }, bytes, written: stats.mtimeMs };
}

async function keep(bytes: Buffer, to: string) {
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, bytes);
}

/** The folder as it is now, into `dir`, for run `id`: a copy of every file small enough, and a list of them all. The list is written last, so a snapshot that was cut short has none and is never believed. */
export async function snapshot(folder: string, dir: string, id: string) {
  await rm(dir, { recursive: true, force: true });
  const files: Record<string, Seen> = {};
  for (const path of await filesOf(folder)) {
    const found = await look(join(folder, path));
    if (!found) continue;
    files[path] = found.seen;
    if (found.bytes) await keep(found.bytes, join(dir, "before", path));
  }
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ id, files }));
}

/**
 * What changed in the folder since the snapshot in `dir` was taken for run `id`, with each changed file as it was and
 * as it is now kept in `into`. Empty when nothing did. Null when it can't be put back for certain, and then nothing is
 * kept: there is no snapshot for this run, a file too big to copy changed, or a file was written after `until` (when
 * the run ended), which is somebody else's work. The snapshot is used up either way.
 */
export async function changesSince(folder: string, dir: string, id: string, into: string, until: number): Promise<FileChange[] | null> {
  const compare = async () => {
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as { id: string; files: Record<string, Seen> };
    if (manifest.id !== id) return null;
    const changes: FileChange[] = [];
    for (const path of new Set([...Object.keys(manifest.files), ...(await filesOf(folder))])) {
      const was = manifest.files[path] ?? null;
      const now = await look(join(folder, path));
      if (JSON.stringify(was) === JSON.stringify(now?.seen ?? null)) continue;
      if ((was && "big" in was) || (now && !now.bytes) || (now && now.written > until)) return null;
      if (was) await keep(await readFile(join(dir, "before", path)), join(into, "before", path));
      if (now?.bytes) await keep(now.bytes, join(into, "after", path));
      changes.push({ path, before: was?.hash ?? null, after: now && "hash" in now.seen ? now.seen.hash : null });
    }
    return changes;
  };
  const changes = await compare().catch(() => null);
  await rm(dir, { recursive: true, force: true });
  if (!changes?.length) await rm(into, { recursive: true, force: true });
  return changes;
}

/** Said when a change can't be put back (or made again) because a file it touched is no longer as it was left. */
export class ChangedSince extends Error {}

/**
 * Sets every file of a change to how it was `before` the run, or `after` it, from the copies in `dir`. All of them or
 * none: first each file is checked to be exactly as the other state left it, and its copy to be what was kept; only
 * then is anything written. Throws `ChangedSince` otherwise, having touched nothing.
 */
export async function put(folder: string, dir: string, files: FileChange[], to: "before" | "after") {
  const from = to === "before" ? "after" : "before";
  const root = resolve(folder);
  const place = (path: string) => {
    const file = resolve(root, path);
    // Only ever a file inside the prototype's folder, whatever the list says.
    if (!file.startsWith(root + sep)) throw new ChangedSince();
    return file;
  };
  for (const file of files) {
    if ((await hashOf(place(file.path))) !== file[from]) throw new ChangedSince();
    if (file[to] !== null && (await hashOf(join(dir, to, file.path))) !== file[to]) throw new ChangedSince();
  }
  for (const file of files) {
    if (file[to] === null) await rm(place(file.path), { force: true });
    else {
      await mkdir(dirname(place(file.path)), { recursive: true });
      await copyFile(join(dir, to, file.path), place(file.path));
    }
  }
}
