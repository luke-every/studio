import "server-only";

import { execFile, spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { QA_FRAME_OFFSET, QA_PREFIX, QA_ROOT, workingCopiesOn } from "./local-prototypes";

const run = promisify(execFile);

/**
 * Design QA, on this machine only.
 *
 * A developer's branch of the website is pulled into a folder of its own (a git worktree of the website's checkout, under
 * `~/Claude/design-qa/<name>`), with this machine's `.env.local` copied in, its dependencies installed and its dev server
 * running on a port of its own. Nothing here ever switches a branch in the website's checkout or in the clone the prototypes
 * read, so a branch that is broken, or half way through a change, can't reach a prototype.
 *
 * What is known about each one is a small file in `.meta` beside the folders (the folder itself is the branch's, and is
 * left as the developer made it); an item is archived, never deleted.
 */
const REPO = join(homedir(), "Claude", "every-website");
const ROOT = QA_ROOT;
const META = join(ROOT, ".meta");
const FIRST_PORT = 3100;

export type QaItem = {
  /** Its folder's name, and what it is called everywhere else. */
  id: string;
  /** The developer's branch, which the QA branch is taken from and a pull request would go back into. */
  branch: string;
  createdAt: string;
  port: number;
  archived?: boolean;
  /** What the studio calls it as a prototype, once its server runs. */
  slug: string;
  /** The port its app is framed through, which is the dev server's with the one header that stops a frame taken out. */
  framePort: number;
  /** Where it stands: being set up, its server running, its server stopped, or setup that failed. */
  state: "preparing" | "running" | "stopped" | "failed";
  /** What setup is doing now, while it is. */
  step?: string;
  /** The end of what setup said, when it failed. */
  problem?: string;
  path: string;
};
type Meta = Pick<QaItem, "id" | "branch" | "createdAt" | "port" | "archived">;

const guard = () => {
  if (!workingCopiesOn()) throw new Error("Design QA is only on this machine.");
};

const git = (...args: string[]) => run("git", ["-C", REPO, ...args], { maxBuffer: 8_000_000, timeout: 120_000 });

/** The place the programs setup runs are found: the node this studio runs on has pnpm beside it, and Homebrew has the rest. */
const toolPath = () => [dirname(process.execPath), "/opt/homebrew/bin", "/usr/local/bin", process.env.PATH ?? ""].join(":");

/**
 * What a website's dev server is started with: this machine's environment without what the studio itself runs on. The studio is a
 * Next app, and Next marks the environment it has read (`__NEXT_PROCESSED_ENV`) and keeps what it loaded from its own `.env.local`
 * (`NEXT_PUBLIC_…`) there; a server started inside it would take that for its own, skip the website's `.env.local` and fail on
 * variables it can't find.
 */
const cleanEnv = (extra: Record<string, string> = {}) => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(__NEXT_|NEXT_|TURBOPACK|NODE_ENV$|PORT$|INIT_CWD$|npm_)/.test(key)));
  return { ...env, PATH: toolPath(), ...extra } as unknown as NodeJS.ProcessEnv;
};

const metaFile = (id: string) => join(META, `${id}.json`);
const checkedId = (id: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw new Error("That isn't a design QA.");
  return id;
};

async function readMeta(id: string): Promise<Meta> {
  try {
    return JSON.parse(await readFile(metaFile(checkedId(id)), "utf8")) as Meta;
  } catch {
    throw new Error("That design QA isn't here any more.");
  }
}

/** Whether something is listening on a port, and which processes. */
async function listeners(port: number) {
  const { stdout } = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).catch(() => ({ stdout: "" }));
  return stdout.split("\n").filter(Boolean).map(Number);
}

/** Starts the second server it is framed through, if it isn't running (the studio may have been restarted since the dev server came up). */
async function ensureProxy(meta: Meta) {
  const frame = meta.port + QA_FRAME_OFFSET;
  if ((await listeners(frame)).length) return;
  const log = openSync(join(META, `${meta.id}.log`), "a");
  // From the studio's own folder, not the branch's: a server started in the branch's folder is taken to be its dev server.
  const child = spawn(process.execPath, [join(process.cwd(), "scripts", "qa-frame-proxy.mjs"), String(frame), String(meta.port), join(ROOT, meta.id)], { cwd: process.cwd(), detached: true, stdio: ["ignore", log, log], env: cleanEnv() });
  child.unref();
  closeSync(log);
}

/** The first port from 3100 that nothing has, and no design QA has been given, with the one it is framed through. */
async function freePort(taken: number[]) {
  for (let port = FIRST_PORT; port < FIRST_PORT + 200; port++) {
    if (taken.includes(port) || (await listeners(port)).length || (await listeners(port + QA_FRAME_OFFSET)).length) continue;
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("No port is free for another dev server.");
}

const tail = async (file: string, lines = 12) => (await readFile(file, "utf8").catch(() => "")).trim().split("\n").slice(-lines).join("\n");

async function describe(meta: Meta): Promise<QaItem> {
  const path = join(ROOT, meta.id);
  const statusFile = join(META, `${meta.id}.status`);
  const written = (await readFile(statusFile, "utf8").catch(() => "")).trim();
  // A step left behind by something that stopped half way (the studio was closed) isn't what is going on now.
  const stale = written !== "failed" && written !== "ready" && Date.now() - ((await stat(statusFile).catch(() => null))?.mtimeMs ?? 0) > 15 * 60_000;
  const step = stale ? "ready" : written;
  const up = (await listeners(meta.port)).length > 0;
  if (up) await ensureProxy(meta);
  const state: QaItem["state"] = step === "failed" ? "failed" : step && step !== "ready" ? "preparing" : up ? "running" : "stopped";
  return {
    ...meta,
    /** The prototype it is opened as while its server runs (see `workingCopies`). */
    slug: QA_PREFIX + meta.id,
    framePort: meta.port + QA_FRAME_OFFSET,
    path,
    state,
    step: state === "preparing" ? step : undefined,
    problem: state === "failed" ? await tail(join(META, `${meta.id}.log`)) : undefined,
  };
}

/** Every design QA, newest first. */
export async function listItems() {
  guard();
  const names = await readdir(META).catch(() => [] as string[]);
  const items = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          return await describe(JSON.parse(await readFile(join(META, name), "utf8")) as Meta);
        } catch {
          return null;
        }
      }),
  );
  return items.filter((item): item is QaItem => !!item).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The website's remote branches, the most recently touched first, after asking the remote what there is now. */
export async function listBranches() {
  guard();
  await git("fetch", "--prune", "origin");
  const { stdout } = await git("for-each-ref", "--sort=-committerdate", "--count=300", "--format=%(refname:short)\t%(committerdate:iso8601-strict)\t%(authorname)", "refs/remotes/origin");
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [ref, at, author] = line.split("\t");
      return { name: ref.replace(/^origin\//, ""), at, author };
    })
    .filter((branch) => branch.name !== "HEAD" && branch.name !== "origin");
}

/** Brings the dev server up, and the second one it is framed through; then asks it for its first page, which is when it compiles, so that is waited out here and not by whoever opens it. */
const SERVE = `
echo "Starting" > "$STATUS"
nohup pnpm exec next dev -p "$PORT" >> "$LOG" 2>&1 &
for i in $(seq 1 90); do
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN > /dev/null 2>&1 && break
  sleep 1
done
(cd "$STUDIO" && nohup node "$PROXY" "$FRAME" "$PORT" "$DIR" >> "$LOG" 2>&1 &)
echo "Compiling the first page" > "$STATUS"
curl -s -o /dev/null -m 240 "http://localhost:$PORT/" >> "$LOG" 2>&1
echo ready > "$STATUS"
`;

const SETUP = `
cd "$DIR" || exit 1
fail() { echo failed > "$STATUS"; exit 1; }
echo "Copying settings" > "$STATUS"
cp "$REPO/.env.local" .env.local || { echo "There is no .env.local in the website's folder to copy." >> "$LOG"; fail; }
echo "Installing" > "$STATUS"
(pnpm install --frozen-lockfile || pnpm install) >> "$LOG" 2>&1 || fail
${SERVE}
`;

/** What the scripts above are given. */
const scriptEnv = (meta: Meta, path: string) =>
  cleanEnv({ DIR: path, REPO, PORT: String(meta.port), FRAME: String(meta.port + QA_FRAME_OFFSET), STUDIO: process.cwd(), PROXY: join(process.cwd(), "scripts", "qa-frame-proxy.mjs"), STATUS: join(META, `${meta.id}.status`), LOG: join(META, `${meta.id}.log`) });

/** Pulls a branch into a folder of its own and sets it up in the background; the item is there at once, "preparing". */
export async function createItem(branch: string) {
  guard();
  if (!/^[\w./-]{1,200}$/.test(branch)) throw new Error("That isn't a branch name.");
  await git("rev-parse", "--verify", "--quiet", `origin/${branch}`).catch(() => {
    throw new Error("That branch isn't on the remote.");
  });
  await mkdir(META, { recursive: true });

  const existing = (await readdir(META)).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
  const taken = await Promise.all(existing.map((id) => readMeta(id).then((one) => one.port)));
  const base = branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "qa";
  let id = base;
  for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`;

  const path = join(ROOT, id);
  // A local branch of its own, so nothing here can move the developer's: it is taken from theirs, and tracks nothing.
  await git("worktree", "add", "--no-track", "-b", `qa/${id}`, path, `origin/${branch}`);
  // What the studio keeps about it (comments, notes) goes in its folder: it is not the developer's, and must never be committed.
  const exclude = (await run("git", ["-C", path, "rev-parse", "--path-format=absolute", "--git-path", "info/exclude"])).stdout.trim();
  await mkdir(dirname(exclude), { recursive: true });
  await writeFile(exclude, `${await readFile(exclude, "utf8").catch(() => "")}\n.studio/\n`);

  const port = await freePort(taken);
  const meta: Meta = { id, branch, createdAt: new Date().toISOString(), port };
  await writeFile(metaFile(id), JSON.stringify(meta, null, 2));

  const log = openSync(join(META, `${id}.log`), "a");
  const child = spawn("bash", ["-c", SETUP], {
    detached: true,
    stdio: ["ignore", log, log],
    env: scriptEnv(meta, path),
  });
  child.unref();
  closeSync(log);
  return describe(meta);
}

/** Starts the dev server of one whose server has been stopped. */
export async function startItem(id: string) {
  guard();
  const meta = await readMeta(id);
  if ((await listeners(meta.port)).length) return describe(meta);
  const path = join(ROOT, id);
  const log = openSync(join(META, `${id}.log`), "a");
  const child = spawn("bash", ["-c", `cd "$DIR" || exit 1\n${SERVE}`], { detached: true, stdio: ["ignore", log, log], env: scriptEnv(meta, path) });
  child.unref();
  closeSync(log);
  await writeFile(join(META, `${id}.status`), "Starting");
  return describe(meta);
}

/** Stops its dev server; the folder and what was changed in it stay. */
export async function stopItem(id: string) {
  guard();
  const meta = await readMeta(id);
  for (const pid of [...(await listeners(meta.port)), ...(await listeners(meta.port + QA_FRAME_OFFSET))]) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  return describe(meta);
}

/** Puts one away: its server stopped, its folder kept. */
export async function archiveItem(id: string, archived: boolean) {
  guard();
  if (archived) await stopItem(id);
  const meta = await readMeta(id);
  await writeFile(metaFile(id), JSON.stringify({ ...meta, archived: archived || undefined }, null, 2));
}

/** Opens iTerm in its folder: a new window, already there, to start Claude Code in. */
export async function openInITerm(id: string) {
  guard();
  const path = join(ROOT, (await readMeta(id)).id);
  await run("osascript", [
    "-e", "on run argv",
    "-e", "set theDir to item 1 of argv",
    // By its bundle id: its name is "iTerm" or "iTerm2" or "iTerm 2" depending on how it was installed, and the script only compiles when it is found.
    "-e", 'tell application id "com.googlecode.iterm2"',
    "-e", "activate",
    "-e", "create window with default profile",
    "-e", "tell current session of current window",
    "-e", 'write text ("cd " & quoted form of theDir)',
    "-e", "end tell",
    "-e", "end tell",
    "-e", "end run",
    path,
  ]);
}

/** Shows its folder in Finder. */
export async function revealItem(id: string) {
  guard();
  await run("open", [join(ROOT, (await readMeta(id)).id)]);
}

/** Takes away a design QA that failed to set up, so it can be pulled again: only one that never worked, and only its worktree. */
export async function discardFailed(id: string) {
  guard();
  const item = await describe(await readMeta(id));
  if (item.state !== "failed") throw new Error("Only one that failed to set up can be discarded.");
  await git("worktree", "remove", "--force", item.path);
  await git("branch", "-D", `qa/${id}`).catch(() => {});
  await Promise.all(["json", "status", "log"].map((ext) => rm(join(META, `${id}.${ext}`), { force: true })));
}
