#!/usr/bin/env node
/**
 * Push a prototype to Prototype Studio.
 *
 * Commits the whole folder, at its real relative paths, straight to the
 * studio's content repository on GitHub, then tells the studio the commit.
 * The files never pass through the studio: a Vercel Function can't take a
 * request over 4.5MB, and GitHub's own ceiling is 100MB a file.
 *
 *   1. /api/push/start  — which version this becomes, and the repository
 *   2. GitHub           — a blob per file, one tree, one commit, move the ref
 *   3. /api/push        — the commit and the notes; the studio records it
 *
 * No scanning what the entry references and no inlining — a relative
 * reference anywhere in the folder resolves on its own once served, because
 * the folder structure it was written against is the one it's served from.
 *
 * Usage:
 *   node push.mjs --dir . --name "Quiz results" --author "Luke" \
 *     --title "Tighter results layout" --changes "Cut the second card." \
 *     [--entry index.html] [--slug quiz-results] [--team acquisition] \
 *     [--project some-project] [--description "..."] [--version v0.5] [--small] [--figma <url>] [--notion <url>] \
 *     [--flow flow.json | --no-flow]
 *
 * Studio address and password come from ~/.claude/prototype-studio.json
 * unless --studio-url / --studio-password override them.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// One line of timings at the end, so a slow push shows where the time went.
const laps = [];
let lapAt = Date.now();
const lap = (label) => {
  const now = Date.now();
  laps.push(`${label} ${((now - lapAt) / 1000).toFixed(1)}s`);
  lapAt = now;
};

const dirArg = flag("dir");
const name = flag("name");
if (!dirArg || !name) {
  console.error(
    'Usage: node push.mjs --dir . --name "..." --author "..." [--entry index.html] [--slug ...] [--team ...] [--project ...] [--description "..."] [--title "..."] [--changes "..."]',
  );
  process.exit(1);
}

const configPath = join(homedir(), ".claude", "prototype-studio.json");
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {};
const studioUrl = flag("studio-url") ?? config.url;
const studioPassword = flag("studio-password") ?? config.password;
if (!studioUrl) {
  console.error(`No studio configured in ${configPath}, and no --studio-url given.`);
  process.exit(1);
}

const root = resolve(dirArg);
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`No such folder: ${root}`);
  process.exit(1);
}

// A Next app (a package.json with next in it, and no index.html) is built here, after the studio has said which
// version it will be: the build is pinned to that version's address, so it runs as it does in `next dev`.
const packagePath = join(root, "package.json");
const packageJson = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, "utf8")) : null;
const appMode = Boolean(packageJson && { ...packageJson.dependencies, ...packageJson.devDependencies }.next) && !flag("entry") && !existsSync(join(root, "index.html"));

// Studio prototypes are static exports, so anything that needs a server stops here in a moment, not after a build.
// A route handler marked force-static is fine: it is built to a file.
function serverFeatures(dir) {
  const found = [];
  const skip = new Set(["node_modules", ".next", ".git", "out", "dist", "build"]);
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      const rel = relative(dir, full).split(sep).join("/");
      if (!/\.(m?[jt]sx?)$/.test(entry.name)) continue;
      if (/^(src\/)?(middleware|proxy)\.[jt]s$/.test(rel)) found.push(`${rel} (middleware)`);
      else if (statSync(full).size < 1_000_000) {
        const text = readFileSync(full, "utf8");
        if (/(^|\/)app\/.*\/route\.[jt]sx?$|^(src\/)?app\/route\.[jt]sx?$/.test(rel) && !text.includes("force-static")) found.push(`${rel} (API route)`);
        else if (/^["']use server["']/m.test(text)) found.push(`${rel} (server action)`);
      }
    }
  };
  for (const folder of ["src", "app"]) if (existsSync(join(dir, folder))) visit(join(dir, folder));
  for (const file of ["middleware.ts", "middleware.js", "proxy.ts", "proxy.js"]) if (existsSync(join(dir, file))) found.push(`${file} (middleware)`);
  return [...new Set(found)];
}
if (appMode) {
  const blockers = serverFeatures(root);
  if (blockers.length) {
    console.error(
      `Nothing was pushed: studio prototypes are static, and this app uses ${blockers.slice(0, 5).join(", ")}${blockers.length > 5 ? ` and ${blockers.length - 5} more` : ""}. Fetch from the browser instead.`,
    );
    process.exit(1);
  }
}

const entryRel = flag("entry") ?? "index.html";
let entryPath = resolve(root, entryRel);
if (!appMode && !existsSync(entryPath)) {
  console.error(`No entry file at ${entryPath}. Pass --entry if it isn't index.html.`);
  process.exit(1);
}

async function studio(path, body, { soft = false } = {}) {
  const response = await fetch(new URL(path, studioUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(studioPassword ? { "x-studio-password": studioPassword } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const error = result.error ?? `The studio answered ${response.status}.`;
    if (soft) return { error };
    console.error(error);
    process.exit(1);
  }
  return result;
}

// 1. Which version this becomes, and where it goes.
// The studio works out from the name whether this is new or the next version of something it has, so there is no lookup first.
// Nothing is written and nothing is built until this answers.
const start = await studio("/api/push/start", { name, slug: flag("slug"), team: flag("team"), version: flag("version"), small: args.includes("--small") }, { soft: true });
if (start.error) {
  console.error(start.error);
  if (/needs a team/.test(start.error)) {
    const known = await fetch(new URL("/api/prototypes", studioUrl), { headers: studioPassword ? { "x-studio-password": studioPassword } : {} })
      .then((response) => response.json())
      .catch(() => null);
    if (known?.teams) console.error(`Teams: ${known.teams.map((team) => team.slug).join(", ")}. Run again with --team <one of them>.`);
  }
  process.exit(1);
}
// A studio that predates --version ignores it and picks its own number;
// better to stop than to save the files under a number nobody asked for.
if (flag("version") && start.version !== flag("version")) {
  console.error(`The studio chose ${start.version}, not ${flag("version")}. It needs updating before it will take a version number.`);
  process.exit(1);
}
lap("studio");
const { owner, repo, branch, token } = start.repository;
const prefix = start.prefix;

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "dist", "build"]);
// GitHub refuses any single file over 100MB.
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function walk(dir, skip = SKIP_DIRS) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full, skip));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

let files;
if (appMode) {
  const usesPnpm = existsSync(join(root, "pnpm-lock.yaml")) || String(packageJson.packageManager ?? "").startsWith("pnpm");
  const pnpm = spawnSync("pnpm", ["--version"]).status === 0 ? "pnpm" : `npx -y pnpm@${String(packageJson.packageManager ?? "").replace(/^pnpm@/, "") || "10"}`;
  // Output is captured and only its tail is shown on failure: a full build log is thousands of tokens nobody reads.
  const run = (command, env = process.env) => {
    const result = spawnSync(command, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env });
    const tail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-20).join("\n");
    return { ok: result.status === 0, tail };
  };
  if (!existsSync(join(root, "node_modules"))) {
    console.log("Installing dependencies ...");
    const installed = run(usesPnpm ? `${pnpm} install --silent` : "npm install --silent");
    if (!installed.ok) {
      console.error(`Installing the app's dependencies failed, so nothing was pushed.\n${installed.tail}`);
      process.exit(1);
    }
    lap("install");
  }
  const segment = start.version.replace(/\./g, "-");
  const out = join(root, "out");
  rmSync(out, { recursive: true, force: true });
  console.log(`Building for /p/${start.slug}/${segment} ...`);
  const built = run(usesPnpm ? `${pnpm} run build` : "npm run build", { ...process.env, STUDIO_BASE_PATH: `/p/${start.slug}/${segment}` });
  if (!built.ok || !existsSync(join(out, "index.html"))) {
    console.error(
      `The build didn't produce a site, so nothing was pushed. Studio prototypes are static: API routes, server actions and middleware can't be part of one. Last lines of the build:\n${built.tail}`,
    );
    process.exit(1);
  }
  lap("build");
  entryPath = join(out, "index.html");
  // The built site is the version; the app's own source rides along in _source/ so engineers can read it all.
  const site = walk(out, new Set()).map((filePath) => ({ filePath, path: relative(out, filePath).split(sep).join("/"), size: statSync(filePath).size }));
  const source = walk(root, new Set([...SKIP_DIRS, "out"])).map((filePath) => ({ filePath, path: `_source/${relative(root, filePath).split(sep).join("/")}`, size: statSync(filePath).size }));
  files = [...site, ...source];
} else {
  files = walk(root).map((filePath) => ({
    filePath,
    path: filePath === entryPath ? "index.html" : relative(root, filePath).split(sep).join("/"),
    size: statSync(filePath).size,
  }));
}

// --flow: the prototype's flow, kept as a file in its own source and merged into the
// uploaded studio.json (beside any controls), so a build can't wipe it.
const flowArg = flag("flow");
// Without --flow, the previous version's flow (sent back by the studio) is carried forward; --no-flow drops it.
const carried = !flowArg && !args.includes("--no-flow") && start.previousFlow?.flow?.screens?.length ? start.previousFlow : null;
if (flowArg || carried) {
  let flow = carried?.flow;
  if (flowArg) try {
    const parsed = JSON.parse(readFileSync(resolve(flowArg), "utf8"));
    flow = parsed.flow ?? parsed;
  } catch (error) {
    console.error(`Couldn't read the flow at ${flowArg}: ${error.message}`);
    process.exit(1);
  }
  if (!Array.isArray(flow.screens) || flow.screens.length < 2) {
    console.error("A flow needs a `screens` list of at least two screens.");
    process.exit(1);
  }
  const ids = new Set(flow.screens.map((screen) => screen.id));
  const problems = [
    ...(ids.size < flow.screens.length ? ["two screens share an id"] : []),
    ...(flow.edges ?? []).filter((edge) => !ids.has(edge.from) || !ids.has(edge.to)).map((edge) => `an arrow goes ${edge.from} → ${edge.to}, and one of them isn't a screen`),
  ];
  if (problems.length) {
    console.error(`The flow has problems: ${problems.join("; ")}.`);
    process.exit(1);
  }
  // A parameter nothing in the files reads can't open its screen: it would show the first one.
  const keys = new Set(flow.screens.flatMap((screen) => Object.keys(screen.params ?? {})));
  const sources = files.filter((file) => /\.(m?js|html)$/.test(file.path) && file.size < 5_000_000).map((file) => readFileSync(file.filePath, "utf8"));
  const unread = [...keys].filter((key) => !sources.some((text) => text.includes(key)));
  if (unread.length) {
    console.warn(`Heads up: nothing in the files reads ${unread.map((key) => `?${key}=`).join(", ")}, so those screens would open on the first one. Add the handling, rebuild and push again.`);
  }
  const existing = files.find((file) => file.path === "studio.json");
  let manifest = {};
  if (existing) {
    try {
      manifest = JSON.parse(readFileSync(existing.filePath, "utf8"));
    } catch {
      // An unreadable studio.json is replaced.
    }
  }
  if (carried) console.log(`Flow: ${flow.screens.length} screens (carried over from ${carried.version})`);
  const content = Buffer.from(`${JSON.stringify({ ...manifest, flow }, null, 2)}\n`);
  if (existing) Object.assign(existing, { content, size: content.length });
  else files.push({ filePath: join(root, "studio.json"), path: "studio.json", size: content.length, content });
}

const tooBig = files.filter((file) => file.size > MAX_FILE_BYTES);
if (tooBig.length) {
  console.error(`GitHub won't take files over 100MB: ${tooBig.map((file) => file.path).join(", ")}`);
  process.exit(1);
}
// A prototype that stamps its own files with the time (`?v=${Date.now()}`)
// gets a new address for every file on every load, so nothing it has loaded
// can be reused — the studio caches each version for good, and this defeats it.
const BUSTER = /\?\w+=\$\{[^}]*(?:Date\.now|Math\.random)\(\)[^}]*\}|\?\w*=?["']\s*\+\s*(?:Date\.now|Math\.random)\(\)/;
const busting = files.filter(
  (file) => /\.(m?js|html|css)$/.test(file.path) && file.size < 2_000_000 && BUSTER.test(readFileSync(file.filePath, "utf8")),
);
if (busting.length) {
  console.warn(
    `Heads up: ${busting.map((file) => file.path).join(", ")} adds the time to its own file addresses, so every load re-downloads everything and the prototype opens slowly in the studio. Pin it to a fixed string and push again.`,
  );
}
// The flow (see SKILL.md): said out loud at the end, so leaving it out is a decision, not an accident.
let flowScreens = 0;
const manifest = files.find((file) => file.path === "studio.json");
if (manifest) {
  try {
    flowScreens = JSON.parse(manifest.content?.toString() ?? readFileSync(manifest.filePath, "utf8")).flow?.screens?.length ?? 0;
  } catch {
    // An unreadable studio.json just means no flow.
  }
}
const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
lap("scan");

async function github(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`${process.env.GITHUB_API ?? "https://api.github.com"}/repos/${owner}/${repo}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (response.ok) return response.json();
    // Secondary rate limits and GitHub's own hiccups clear up on a retry.
    if ((response.status === 403 || response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((done) => setTimeout(done, attempt * 2000));
      continue;
    }
    const error = new Error(
      `GitHub ${init.method ?? "GET"} ${path} failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
    error.status = response.status;
    throw error;
  }
}

// 2. Commit the folder. Versions are never replaced.
try {
  await github(`/contents/${prefix}/index.html?ref=${branch}`);
  console.error(`${start.version} of ${start.slug} is already in the content repository. Push again.`);
  process.exit(1);
} catch (error) {
  if (error.status !== 404) throw error;
}

// Blobs the previous version of this prototype already holds (same git hash)
// are referenced, not re-sent. Every version is still a full snapshot. This is
// only a shortcut: re-posting an existing blob is harmless, so any failure
// here just means everything uploads.
const known = new Set();
try {
  const slugDir = prefix.split("/").slice(0, -1).join("/");
  const head = await github(`/git/ref/heads/${branch}`);
  let dir = (await github(`/git/commits/${head.object.sha}`)).tree.sha;
  for (const part of slugDir.split("/")) {
    dir = (await github(`/git/trees/${dir}`)).tree.find((entry) => entry.type === "tree" && entry.path === part)?.sha;
    if (!dir) break;
  }
  if (dir) {
    const own = prefix.split("/").pop();
    const number = (name) => name.replace(/^v/, "").split(".").map(Number);
    const newest = (await github(`/git/trees/${dir}`)).tree
      .filter((entry) => entry.type === "tree" && entry.path !== own)
      .sort((x, y) => {
        const [a, b] = [number(x.path), number(y.path)];
        for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) - (a[i] ?? 0);
        return 0;
      })[0];
    if (newest) for (const entry of (await github(`/git/trees/${newest.sha}?recursive=1`)).tree) if (entry.type === "blob") known.add(entry.sha);
  }
} catch {
  // No listing means nothing is known; everything uploads.
}
lap("listing");

// One blob per distinct content, however many paths use it.
const byHash = new Map();
for (const file of files) {
  const data = file.content ?? readFileSync(file.filePath);
  const hash = createHash("sha1").update(`blob ${Buffer.byteLength(data)}\0`).update(data).digest("hex");
  file.hash = hash;
  if (!byHash.has(hash)) byHash.set(hash, file);
}
const tree = files.map((file) => ({ path: `${prefix}/${file.path}`, mode: "100644", type: "blob", sha: file.hash }));
let uploaded = 0;
const queue = [...byHash.entries()].filter(([hash]) => !known.has(hash));
const toUpload = queue.length;
const reused = files.length - toUpload;
async function uploadNext() {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const [hash, file] = item;
    const data = file.content ?? readFileSync(file.filePath);
    const blob = await github("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: Buffer.from(data).toString("base64"), encoding: "base64" }),
    });
    if (blob.sha !== hash) for (const entry of tree) if (entry.sha === hash) entry.sha = blob.sha;
    uploaded += 1;
    // The counter redraws a line on a terminal; captured output would keep every redraw.
    if (process.stdout.isTTY) process.stdout.write(`\rUploading ${uploaded}/${toUpload}`);
  }
}
await Promise.all(Array.from({ length: 6 }, uploadNext));
if (process.stdout.isTTY) process.stdout.write("\n");
lap("upload");

// Someone else pushing at the same moment moves the branch; build on top
// of wherever it is now and try again.
let commitSha;
for (let attempt = 1; !commitSha; attempt++) {
  const ref = await github(`/git/ref/heads/${branch}`);
  const parent = await github(`/git/commits/${ref.object.sha}`);
  const newTree = await github("/git/trees", {
    method: "POST",
    body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
  });
  const commit = await github("/git/commits", {
    method: "POST",
    body: JSON.stringify({
      message: `Push ${start.slug} ${start.version}`,
      tree: newTree.sha,
      parents: [ref.object.sha],
    }),
  });
  try {
    await github(`/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha }),
    });
    commitSha = commit.sha;
  } catch (error) {
    if (error.status !== 422 || attempt >= 5) throw error;
  }
}

lap("commit");

// 3. Tell the studio.
const notes = { name, version: start.version, commit: commitSha, slug: start.slug };
for (const field of ["team", "project", "description", "author", "title", "changes", "figma", "notion"]) {
  const value = flag(field);
  if (value) notes[field] = value;
}
if (!notes.author) notes.author = spawnSync("git", ["config", "user.name"], { encoding: "utf8" }).stdout.trim() || "Someone";

const result = await studio("/api/push", notes);
lap("record");

console.log(`Uploaded ${files.length - reused} new file(s), ${reused} unchanged, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
console.log(`Pushed ${result.slug} ${result.version}`);
console.log(result.studio);
console.log(`Time: ${laps.join(" · ")}`);
console.log(
  flowScreens
    ? `Flow: ${flowScreens} screens`
    : "Flow: none. Fine for a single screen; if this has several, add one (step 2 of the skill) and push again.",
);
