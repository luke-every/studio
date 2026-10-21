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
 *     [--flow flow.json | --no-flow] [--no-controls]
 *
 * Studio address and password come from ~/.claude/prototype-studio.json
 * unless --studio-url / --studio-password override them.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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

// Studio prototypes are static exports. If a build fails, these are named as the likely cause.
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

// An app that wasn't started with /newprototype doesn't know about the studio's address. Rather than ask anyone to
// edit their code, the build runs behind a small wrapper config: the app's own next.config is moved aside, a
// pass-through wrapper takes its place (it does nothing unless STUDIO_BASE_PATH is set, so `next dev` still works),
// and the original is put back the moment the build ends. Apps whose config already reads STUDIO_BASE_PATH are left alone.
const CONFIG_EXTENSIONS = ["ts", "mjs", "js", "cjs"];
function studioConfig(dir) {
  const configs = CONFIG_EXTENSIONS.map((ext) => ({ ext, path: join(dir, `next.config.${ext}`), aside: join(dir, `next.config.studio-original.${ext}`) }));
  // A push that was killed mid-build leaves the original moved aside: put it back first.
  for (const config of configs) {
    if (existsSync(config.aside)) {
      rmSync(config.path.replace(/\.[^.]+$/, ".mjs"), { force: true });
      rmSync(config.path, { force: true });
      renameSync(config.aside, config.path);
    }
  }
  const original = configs.find((config) => existsSync(config.path));
  if (original && readFileSync(original.path, "utf8").includes("STUDIO_BASE_PATH")) return { apply() {}, restore() {} };
  const wrapperExt = original?.ext === "ts" ? "ts" : "mjs";
  const wrapperPath = join(dir, `next.config.${wrapperExt}`);
  const importPath = original ? `./next.config.studio-original${original.ext === "ts" ? "" : `.${original.ext}`}` : null;
  const typed = wrapperExt === "ts";
  const wrapper = `// Written by /push for the studio build and removed straight after.
${typed ? 'import type { NextConfig } from "next";\n' : ""}${importPath ? `import original from "${importPath}";` : `const original${typed ? ": NextConfig" : ""} = {};`}
export default async (...args${typed ? ": unknown[]" : ""})${typed ? ": Promise<NextConfig>" : ""} => {
${typed ? "  const source = original as unknown as NextConfig | ((...rest: unknown[]) => NextConfig | Promise<NextConfig>);\n" : ""}  const base${typed ? ": NextConfig" : ""} = typeof ${typed ? "source" : "original"} === "function" ? await ${typed ? "source" : "original"}(...args) : (${typed ? "source" : "original"} ?? {});
  const studioBase = process.env.STUDIO_BASE_PATH;
  if (!studioBase) return base;
  return { ...base, output: "export", basePath: studioBase, distDir: ".next", images: { ...base.images, unoptimized: true } };
};
`;
  return {
    apply() {
      if (original) renameSync(original.path, original.aside);
      writeFileSync(wrapperPath, wrapper);
    },
    restore() {
      rmSync(wrapperPath, { force: true });
      if (original) renameSync(original.aside, original.path);
    },
  };
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
  const config = studioConfig(root);
  config.apply();
  let built;
  try {
    built = run(usesPnpm ? `${pnpm} run build` : "npm run build", { ...process.env, STUDIO_BASE_PATH: `/p/${start.slug}/${segment}` });
  } finally {
    config.restore();
  }
  if (!built.ok || !existsSync(join(out, "index.html"))) {
    // Server code is only a problem if it ends up in the build (an app's own config may leave it out), so it is
    // named here, as the likely reason, rather than refused before trying.
    const blockers = serverFeatures(root);
    const likely = blockers.length
      ? ` This app has ${blockers.slice(0, 5).join(", ")}${blockers.length > 5 ? ` and ${blockers.length - 5} more` : ""}, which a static export can't include; that is the likely cause.`
      : "";
    console.error(
      `The build didn't produce a site, so nothing was pushed. Studio prototypes are static: API routes, server actions and middleware can't be part of one.${likely} Last lines of the build:\n${built.tail}`,
    );
    process.exit(1);
  }
  lap("build");
  // Paths that start with "/" ignore the studio's address, so they load from the wrong place. Next's own links and
  // <Image> add it; a plain <img src="/logo.png"> or CSS url(/bg.png) doesn't. Say so once, naming a few.
  {
    const base = `/p/${start.slug}/${segment}/`;
    const bare = new Set();
    for (const file of walk(out, new Set())) {
      if (!/\.(html|css)$/.test(file) || statSync(file).size > 2_000_000) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/(?:<(?:img|source|video|audio)\b[^>]*?\bsrc|url\()\s*=?\s*["']?(\/(?!\/)[^"'\s)>]*)/g)) {
        if (!match[1].startsWith(base) && !match[1].startsWith("/p/")) bare.add(match[1]);
      }
    }
    if (bare.size) {
      console.warn(
        `Heads up: ${bare.size} file path(s) start with "/" (${[...bare].slice(0, 3).join(", ")}${bare.size > 3 ? ", …" : ""}). Those ignore the studio's address, so they won't load there. Use relative paths, or the framework's own image and link components.`,
      );
    }
  }
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

// Controls (studio.json `controls`): the folder's own always win; otherwise the previous version's are carried
// forward, so adding a flow or rebuilding can't silently drop them. Merged into the uploaded studio.json like the flow.
function validateControls(controls) {
  const problems = [];
  const ids = new Set();
  for (const control of controls) {
    if (!control || typeof control.id !== "string" || !control.id) problems.push("a control has no id");
    else if (ids.has(control.id)) problems.push(`two controls share the id "${control.id}"`);
    else ids.add(control.id);
    const id = control?.id ?? "?";
    if (typeof control?.label !== "string" || !control.label) problems.push(`control "${id}" has no label`);
    if (control?.type === "choice") {
      const values = Array.isArray(control.options) ? control.options.map((option) => option?.value) : [];
      if (values.length < 2) problems.push(`control "${id}" needs at least two options`);
      else if (!values.includes(control.default)) problems.push(`control "${id}" defaults to "${control.default}", which isn't one of its options`);
    } else if (control?.type === "range") {
      const { min, max, step, default: value } = control;
      if (![min, max, value].every(Number.isFinite) || min >= max) problems.push(`control "${id}" needs numbers with min below max`);
      else if (value < min || value > max) problems.push(`control "${id}" defaults to ${value}, outside ${min} to ${max}`);
      if (step !== undefined && !(step > 0)) problems.push(`control "${id}" needs a step above 0`);
    } else if (control?.type !== "toggle") problems.push(`control "${id}" must be a choice or a toggle`);
  }
  for (const control of controls) if (control?.when && !ids.has(control.when.control)) problems.push(`control "${control.id}" depends on "${control.when.control}", which isn't a control`);
  return problems;
}
const manifestFile = () => files.find((file) => file.path === "studio.json");
const readManifest = () => {
  const existing = manifestFile();
  if (!existing) return {};
  try {
    return JSON.parse(existing.content?.toString() ?? readFileSync(existing.filePath, "utf8"));
  } catch {
    return {};
  }
};
const writeManifest = (manifest) => {
  const existing = manifestFile();
  const content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (existing) Object.assign(existing, { content, size: content.length });
  else files.push({ filePath: join(root, "studio.json"), path: "studio.json", size: content.length, content });
};
// Whether anything in the built or source files mentions a URL parameter: the test for "does this still apply".
let sourceTexts;
const readsParam = (param) => {
  sourceTexts ??= files.filter((file) => /\.(m?js|html)$/.test(file.path) && file.size < 5_000_000).map((file) => readFileSync(file.filePath, "utf8"));
  return sourceTexts.some((text) => text.includes(param));
};
let controlsLine = "Controls: none";
{
  const own = readManifest().controls;
  let controls = Array.isArray(own) && own.length ? own : null;
  // No controls of its own: bring the previous version's forward, but only those that still apply (something still
  // reads the parameter, and whatever they depend on is still there).
  let carriedControls = null;
  if (!controls && start.previousControls?.controls?.length && !args.includes("--no-controls")) {
    const earlier = start.previousControls.controls;
    let kept = earlier.filter((control) => readsParam(control.param ?? control.id));
    while (kept.some((control) => control.when && !kept.some((other) => other.id === control.when.control))) {
      kept = kept.filter((control) => !control.when || kept.some((other) => other.id === control.when.control));
    }
    const dropped = earlier.filter((control) => !kept.includes(control)).map((control) => control.id);
    if (kept.length) {
      controls = kept;
      carriedControls = { version: start.previousControls.version, dropped };
      writeManifest({ ...readManifest(), controls });
    } else console.log(`Controls: none (${start.previousControls.version}'s no longer apply: nothing reads ${earlier.map((control) => `?${control.param ?? control.id}=`).join(", ")})`);
  }
  if (controls) {
    const problems = validateControls(controls);
    if (problems.length) {
      console.error(`Nothing was pushed: the controls have a problem: ${problems.join("; ")}.`);
      process.exit(1);
    }
    for (const control of controls) {
      const param = control.param ?? control.id;
      if (!readsParam(param)) console.warn(`Heads up: nothing in the files reads ?${param}=, so that control would do nothing.`);
    }
    controlsLine = `Controls: ${controls.length}${carriedControls ? ` (carried over from ${carriedControls.version}${carriedControls.dropped.length ? `; left out because nothing reads them now: ${carriedControls.dropped.join(", ")}` : ""})` : ""}`;
  }
}

// --flow: the prototype's flow, kept as a file in its own source and merged into the
// uploaded studio.json (beside any controls), so a build can't wipe it.
const flowArg = flag("flow");
// Without --flow, the previous version's flow (sent back by the studio) is carried forward; --no-flow drops it.
let carried = !flowArg && !args.includes("--no-flow") && start.previousFlow?.flow?.screens?.length ? start.previousFlow : null;
// Only if it still applies: every parameter its screens open on must still be read by something.
if (carried) {
  const stale = [...new Set(carried.flow.screens.flatMap((screen) => Object.keys(screen.params ?? {})))].filter((key) => !readsParam(key));
  if (stale.length) {
    console.log(`Flow: not carried over from ${carried.version} (nothing reads ${stale.map((key) => `?${key}=`).join(", ")} any more)`);
    carried = null;
  }
}
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
  writeManifest({ ...readManifest(), flow });
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
console.log(controlsLine);
console.log(
  flowScreens
    ? `Flow: ${flowScreens} screens${carried ? ` (carried over from ${carried.version})` : ""}`
    : "Flow: none. Fine for a single screen; if this has several, add one (step 2 of the skill) and push again.",
);
