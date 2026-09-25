#!/usr/bin/env node
/**
 * Push a prototype to Prototype Studio.
 *
 * Uploads the whole folder, at its real relative paths, in one request. No
 * scanning what the entry references and no inlining — a relative reference
 * anywhere in the folder (a stylesheet, a font a stylesheet points at, a
 * script) resolves on its own once served, because the folder structure it
 * was written against is the folder structure it's served from.
 *
 * Usage:
 *   node push.mjs --dir . --name "Quiz results" --author "Luke" \
 *     --title "Tighter results layout" --changes "Cut the second card." \
 *     [--entry index.html] [--slug quiz-results] [--team acquisition] \
 *     [--project some-project] [--description "..."]
 *
 * Studio address and password come from ~/.claude/prototype-studio.json
 * unless --studio-url / --studio-password override them.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

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

const files = walk(root);

const form = new FormData();
let totalBytes = 0;
for (const filePath of files) {
  const path = relative(root, filePath) === relative(root, entryPath) ? "index.html" : relative(root, filePath);
  const bytes = readFileSync(filePath);
  totalBytes += bytes.length;
  form.append("file", new Blob([bytes]), path);
}

form.append("name", name);
for (const field of ["slug", "team", "project", "description", "author", "title", "changes"]) {
  const value = flag(field);
  if (value) form.append(field, value);
}
if (!flag("author")) form.append("author", "Someone");

const response = await fetch(new URL("/api/push", studioUrl), {
  method: "POST",
  headers: studioPassword ? { "x-studio-password": studioPassword } : {},
  body: form,
});

const result = await response.json();
if (!response.ok || result.error) {
  console.error(result.error ?? `Push failed (${response.status}).`);
  process.exit(1);
}

console.log(`Uploaded ${files.length} file(s), ${(totalBytes / 1024).toFixed(1)} KB`);
console.log(`Pushed ${result.slug} ${result.version}`);
console.log(result.studio);
