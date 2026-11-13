import "server-only";

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Working copies, for working on a prototype on this machine.
 *
 * On this machine only (never in production), every folder in
 * `~/Claude/prototypes` shows up as a prototype of its own, or as one more
 * version of the pushed prototype of that name. With a content repository
 * connected only a running dev server counts; the rest is read from the repository:
 *
 *  - If its dev server is running (found by the folder it was started in), the
 *    studio wraps that: the controls, variants and flow come from the app's own
 *    `studio.json`, `edits.json` and `flow.json`, and the prototype is the live app.
 *  - Otherwise, if it has been built, the studio serves its `out/`.
 *
 * The version is always `v0.0`, so it can't be mistaken for one that was pushed.
 */
const ROOT = join(homedir(), "Claude", "prototypes");

export const WORKING_VERSION = "v0.0";
export const WORKING_SEGMENT = "v0-0";

export const workingCopiesOn = () => process.env.NODE_ENV !== "production";

/** The ports that something is listening on, by the process that is. */
async function listening() {
  const { stdout } = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"]).catch(() => ({ stdout: "" }));
  const ports = new Map<string, number[]>();
  let pid = "";
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("n") && pid) {
      const port = Number(line.slice(line.lastIndexOf(":") + 1));
      if (port) ports.set(pid, [...(ports.get(pid) ?? []), port]);
    }
  }
  return ports;
}

let seen: { at: number; servers: Map<string, { port: number; pid: number }> } | null = null;

/** Which prototypes have a dev server running, with its port and process: the one that was started in that prototype's folder. Looked up at most every couple of seconds, since a page asks for many files. */
async function lookup() {
  if (!workingCopiesOn()) return new Map<string, { port: number; pid: number }>();
  if (seen && Date.now() - seen.at < 2000) return seen.servers;

  const ports = await listening();
  const servers = new Map<string, { port: number; pid: number }>();
  if (ports.size) {
    const { stdout } = await run("lsof", ["-a", "-d", "cwd", "-Fpn", "-p", [...ports.keys()].join(",")]).catch(() => ({ stdout: "" }));
    let pid = "";
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) pid = line.slice(1);
      else if (line.startsWith("n/") && line.slice(1).startsWith(`${ROOT}/`)) {
        const slug = line.slice(1 + ROOT.length + 1).split("/")[0];
        const port = Math.min(...(ports.get(pid) ?? [Infinity]));
        if (Number.isFinite(port) && !servers.has(slug)) servers.set(slug, { port, pid: Number(pid) });
      }
    }
  }
  seen = { at: Date.now(), servers };
  return servers;
}

/** Which prototypes have a dev server running, and on which port. */
export async function devServers() {
  return new Map([...(await lookup())].map(([slug, { port }]) => [slug, port]));
}

/** The address of a prototype's running dev server, or null. */
export async function liveOrigin(slug: string) {
  const port = (await devServers()).get(slug);
  return port ? `http://localhost:${port}` : null;
}

/** Stops the dev server running in a prototype's folder. False when there is none. */
export async function stopDevServer(slug: string) {
  const server = (await lookup()).get(slug);
  if (!server) return false;
  process.kill(server.pid, "SIGTERM");
  seen = null;
  return true;
}

/** The prototype folders that are running or have been built, with when they last were built. */
export async function workingCopies() {
  if (!workingCopiesOn()) return [];
  const running = await devServers();
  const folders = await readdir(ROOT, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(
    folders
      .filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
      .map(async (entry) => {
        const built = await stat(join(ROOT, entry.name, "out", "index.html")).catch(() => null);
        const live = running.has(entry.name);
        return built || live ? { slug: entry.name, builtAt: built?.mtime ?? new Date(), live, port: running.get(entry.name) } : null;
      }),
  );
  return found.flatMap((copy) => (copy ? [copy] : []));
}

/** A file of a working copy's build, or null. */
export async function workingFile(slug: string, path: string[]) {
  if (!workingCopiesOn() || !/^[a-z0-9-]+$/.test(slug)) return null;
  const bytes = await readFile(join(ROOT, slug, "out", ...(path.length ? path : ["index.html"]))).catch(() => null);
  return bytes ? new Response(new Uint8Array(bytes)) : null;
}

/** A working copy's folder, for what runs in it. Only on this machine, and only for a name that can be one. */
export function workingFolder(slug: string) {
  if (!workingCopiesOn() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("That isn't a prototype on this machine.");
  return join(ROOT, slug);
}

/**
 * The studio's own files about a working copy, kept in its folder's `.studio/` rather than in the content repository:
 * nobody else can see a version running on this machine, so nothing about it is committed. `comments.json` is its
 * comments, the same shape as a version's comments file; `claude.json` is Claude's work on them (see `claude-runs.ts`).
 * The folder starts with a dot, so /push leaves it out of what it uploads, and the starter's .gitignore leaves it out
 * of the prototype's own repository.
 */
export type StudioFile = "comments.json" | "claude.json";
export const studioPath = (slug: string, name: string) => join(workingFolder(slug), ".studio", name);

export const readStudioFile = (slug: string, name: StudioFile) => readFile(studioPath(slug, name), "utf8").catch(() => null);

// One change at a time to each file, so two saves close together (a like and a reply) don't both start from the same copy.
const queue = new Map<string, Promise<unknown>>();

/** Read-modify-write, as `updateStoreFile` is; written whole and then moved into place, so a file is never left half written. */
export function updateStudioFile(slug: string, name: StudioFile, fn: (text: string | null) => { content: string }) {
  const file = studioPath(slug, name);
  const next = (queue.get(file) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const { content } = fn(await readFile(file, "utf8").catch(() => null));
      await mkdir(join(file, ".."), { recursive: true });
      await writeFile(`${file}.tmp`, content);
      await rename(`${file}.tmp`, file);
    });
  queue.set(file, next);
  return next;
}
