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
 *     [--project some-project] [--description "..."] [--version v0.5] [--figma <url>] [--notion <url>] \
 *     [--flow flow.json]
 *
 * Studio address and password come from ~/.claude/prototype-studio.json
 * unless --studio-url / --studio-password override them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
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

const entryRel = flag("entry") ?? "index.html";
const entryPath = resolve(root, entryRel);
if (!existsSync(entryPath)) {
  console.error(`No entry file at ${entryPath}. Pass --entry if it isn't index.html.`);
  process.exit(1);
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "dist", "build"]);
// GitHub refuses any single file over 100MB.
const MAX_FILE_BYTES = 100 * 1024 * 1024;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

const files = walk(root).map((filePath) => ({
  filePath,
  path: filePath === entryPath ? "index.html" : relative(root, filePath).split(sep).join("/"),
  size: statSync(filePath).size,
}));

// --flow: the prototype's flow, kept as a file in its own source and merged into the
// uploaded studio.json (beside any controls), so a build can't wipe it.
const flowArg = flag("flow");
if (flowArg) {
  let flow;
  try {
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
  const existing = files.find((file) => file.path === "studio.json");
  let manifest = {};
  if (existing) {
    try {
      manifest = JSON.parse(readFileSync(existing.filePath, "utf8"));
    } catch {
      // An unreadable studio.json is replaced.
    }
  }
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

async function studio(path, body) {
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
    console.error(result.error ?? `The studio answered ${response.status}.`);
    process.exit(1);
  }
  return result;
}

// 1. Which version this becomes, and where it goes.
const start = await studio("/api/push/start", { name, slug: flag("slug"), team: flag("team"), version: flag("version") });
// A studio that predates --version ignores it and picks its own number;
// better to stop than to save the files under a number nobody asked for.
if (flag("version") && start.version !== flag("version")) {
  console.error(`The studio chose ${start.version}, not ${flag("version")}. It needs updating before it will take a version number.`);
  process.exit(1);
}
const { owner, repo, branch, token } = start.repository;
const prefix = start.prefix;

async function github(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
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

const tree = [];
let uploaded = 0;
const queue = [...files];
async function uploadNext() {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const blob = await github("/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: (file.content ?? readFileSync(file.filePath)).toString("base64"), encoding: "base64" }),
    });
    tree.push({ path: `${prefix}/${file.path}`, mode: "100644", type: "blob", sha: blob.sha });
    uploaded += 1;
    process.stdout.write(`\rUploading ${uploaded}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, uploadNext));
process.stdout.write("\n");

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

// 3. Tell the studio.
const notes = { name, version: start.version, commit: commitSha, slug: start.slug };
for (const field of ["team", "project", "description", "author", "title", "changes", "figma", "notion"]) {
  const value = flag(field);
  if (value) notes[field] = value;
}
if (!notes.author) notes.author = "Someone";

const result = await studio("/api/push", notes);

console.log(`Uploaded ${files.length} file(s), ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`Pushed ${result.slug} ${result.version}`);
console.log(result.studio);
console.log(
  flowScreens
    ? `Flow: ${flowScreens} screens`
    : "Flow: none. Fine for a single screen; if this has several, add one (step 2 of the skill) and push again.",
);
