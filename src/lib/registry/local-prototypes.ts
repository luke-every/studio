import "server-only";

import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, openSync } from "node:fs";
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
/**
 * Design QA's folders (see `design-qa.ts`) are working copies too, so a branch being checked opens in the same view a prototype does.
 * Their name carries a prefix, so one can never be taken for a prototype, or share its name.
 */
export const QA_ROOT = join(homedir(), "Claude", "design-qa");
export const QA_PREFIX = "qa-";
/** A design QA is framed through a second server this many ports above its dev server (see `scripts/qa-frame-proxy.mjs`). */
export const QA_FRAME_OFFSET = 1000;

export const WORKING_VERSION = "v0.0";
export const WORKING_SEGMENT = "v0-0";

export const workingCopiesOn = () => process.env.NODE_ENV !== "production";

/** What a dev server runs as. Anything else that happens to listen from a prototype's folder (a Claude Code session opens a port of its own there) is not one. */
const SERVER_COMMAND = /^(node|next|bun|deno|vite)/i;

/** The ports that a dev server is listening on, by the process that is. */
async function listening() {
  const { stdout } = await run("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]).catch(() => ({ stdout: "" }));
  const ports = new Map<string, number[]>();
  let pid = "";
  let server = false;
  for (const line of stdout.split("\n")) {
    if (line.startsWith("p")) pid = line.slice(1);
    else if (line.startsWith("c")) server = SERVER_COMMAND.test(line.slice(1));
    else if (line.startsWith("n") && pid && server) {
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
      } else if (line.startsWith("n/") && line.slice(1).startsWith(`${QA_ROOT}/`)) {
        const slug = QA_PREFIX + line.slice(1 + QA_ROOT.length + 1).split("/")[0];
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
  return port ? `http://localhost:${slug.startsWith(QA_PREFIX) ? port + QA_FRAME_OFFSET : port}` : null;
}

/** Stops the dev server running in a prototype's folder. False when there is none. */
export async function stopDevServer(slug: string) {
  const server = (await lookup()).get(slug);
  if (!server) return false;
  process.kill(server.pid, "SIGTERM");
  seen = null;
  return true;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Waits (up to `seconds`) for a prototype's dev server to be there, or to be gone. */
async function waitFor(slug: string, running: boolean, seconds: number) {
  for (let tries = 0; tries < seconds * 2; tries++) {
    seen = null;
    if ((await lookup()).has(slug) === running) return true;
    await pause(500);
  }
  return false;
}

/**
 * Starts the dev server of a prototype in ~/Claude/prototypes, as `pnpm dev` run in its folder and left running on its own (its output is kept in
 * `.studio/dev.log` there). Next takes the first free port. Where one is running already, that is the answer.
 */
export async function startDevServer(slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!/^[a-z0-9-]+$/.test(slug) || slug.startsWith(QA_PREFIX)) return { ok: false, error: "That prototype can't be started from here." };
  const folder = join(ROOT, slug);
  if (!existsSync(join(folder, "package.json"))) return { ok: false, error: "This prototype has no app in its folder to start." };
  if ((await lookup()).has(slug)) return { ok: true };
  await mkdir(join(folder, ".studio"), { recursive: true });
  const log = openSync(join(folder, ".studio", "dev.log"), "a");
  const failed = await new Promise<string | null>((resolve) => {
    // Not the studio's own environment as it is: it carries the studio's port (`PORT`), which the prototype would try to take, and Next's private settings.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "PORT" && !key.startsWith("__NEXT") && !key.startsWith("NEXT_PRIVATE"))) as NodeJS.ProcessEnv;
    const child: ChildProcess = spawn("pnpm", ["dev"], { cwd: folder, detached: true, stdio: ["ignore", log, log], env });
    child.once("error", () => resolve("pnpm isn't available to the studio. Start it in a terminal in the prototype's folder: pnpm dev"));
    child.once("spawn", () => {
      child.unref();
      resolve(null);
    });
  });
  if (failed) return { ok: false, error: failed };
  return (await waitFor(slug, true, 40)) ? { ok: true } : { ok: false, error: "It didn't come up in time. Its output is in .studio/dev.log in the prototype's folder." };
}

/** Stops the dev server and starts it again: the way to have it read its config, or to get it out of a state. */
export async function restartDevServer(slug: string) {
  if (await stopDevServer(slug)) await waitFor(slug, false, 10);
  return startDevServer(slug);
}

/** The terminal helper keeps a Claude session running in a prototype's folder; this ends it, so nothing is left running in a folder that is going. Best effort: the helper may not be running. */
export async function endTerminal(slug: string) {
  await fetch(`http://127.0.0.1:4748/end?slug=${slug}`, { method: "POST", headers: { Origin: "http://localhost:4747" }, signal: AbortSignal.timeout(2000) }).catch(() => {});
}

/**
 * Moves a working copy's folder to the Trash, where it can still be got back. Renaming it in is tried first; where that
 * isn't possible (macOS won't allow it, the disk is another one, or something of that name is already in the Trash, which
 * can't be listed to check) Finder is asked to do it, and gives it a name of its own.
 */
export async function moveToTrash(folder: string) {
  try {
    await rename(folder, join(homedir(), ".Trash", folder.slice(folder.lastIndexOf("/") + 1)));
  } catch {
    await run("osascript", ["-e", 'on run argv\ntell application "Finder" to delete POSIX file (item 1 of argv)\nend run', folder]);
  }
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
        // A project made in the studio has nothing built or running: just its canvas, until a template is dropped on it.
        const note = built || live ? null : await readFile(join(ROOT, entry.name, ".studio", "new.json"), "utf8").catch(() => null);
        const blank = !!note && /"blank":\s*true/.test(note);
        return built || live || blank ? { slug: entry.name, builtAt: built?.mtime ?? new Date(), live, port: running.get(entry.name), blank } : null;
      }),
  );
  // Every design QA is a prototype whether or not its server is up (it is always live, on the port it was given), so one started after the
  // studio was opened is already there to go into; with the server down, its page simply isn't served.
  const metas = await readdir(join(QA_ROOT, ".meta")).catch(() => [] as string[]);
  const qa = (
    await Promise.all(
      metas
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const meta = JSON.parse((await readFile(join(QA_ROOT, ".meta", name), "utf8").catch(() => "{}")) || "{}") as { id?: string; branch?: string; port?: number; archived?: boolean };
          if (!meta.id || !meta.port || meta.archived || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.id)) return null;
          return { slug: QA_PREFIX + meta.id, builtAt: new Date(), live: true, port: meta.port + QA_FRAME_OFFSET, qa: meta.branch ?? meta.id, blank: false };
        }),
    )
  ).flatMap((copy) => (copy ? [copy] : []));
  return [...found.flatMap((copy) => (copy ? [{ ...copy, qa: undefined as string | undefined }] : [])), ...qa];
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
  return slug.startsWith(QA_PREFIX) ? join(QA_ROOT, slug.slice(QA_PREFIX.length)) : join(ROOT, slug);
}

/**
 * The studio's own files about a working copy, kept in its folder's `.studio/` rather than in the content repository:
 * nobody else can see a version running on this machine, so nothing about it is committed. `comments.json` is its
 * comments, the same shape as a version's comments file; `claude.json` is Claude's work on them (see `claude-runs.ts`).
 * The folder starts with a dot, so /push leaves it out of what it uploads, and the starter's .gitignore leaves it out
 * of the prototype's own repository. `handoff.json` is its handoff (see `handoff.ts`).
 */
export type StudioFile = "comments.json" | "claude.json" | "handoff.json" | "canvas.json" | "copy-docs.json" | "new.json" | "archived.json" | "summary.md";
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
