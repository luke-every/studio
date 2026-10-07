#!/usr/bin/env node
/**
 * Remix a prototype: copy one version of it into a new folder and open
 * Claude Code there. Run by the command the studio's Remix button shows.
 *
 * The original is only read. Its files come straight from the content
 * repository, the same way /push writes them (see /api/remix), and the copy
 * is an ordinary folder that /push saves as a new prototype of its own.
 *
 *   node remix.mjs <slug> <version>
 *
 * Studio address and password come from ~/.claude/prototype-studio.json.
 */
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";

const [slug, version] = process.argv.slice(2);
const config = JSON.parse(readFileSync(join(homedir(), ".claude", "prototype-studio.json"), "utf8"));

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const asked = await fetch(new URL(`/api/remix?slug=${slug}&version=${version}`, config.url), {
  headers: config.password ? { "x-studio-password": config.password } : {},
});
const found = await asked.json().catch(() => ({}));
if (!asked.ok || found.error) fail(found.error ?? `The studio answered ${asked.status}.`);
const { owner, repo, branch, token } = found.repository;

async function github(path) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (response.ok) return response.json();
    if ((response.status === 403 || response.status === 429 || response.status >= 500) && attempt < 4) {
      await new Promise((done) => setTimeout(done, attempt * 2000));
      continue;
    }
    fail(`GitHub ${path} failed (${response.status}).`);
  }
}

// Where it goes is the person's choice; Enter takes the suggestion. Never over something that's there.
let tty = null;
try {
  tty = openSync("/dev/tty", "r");
} catch {}
async function ask(question) {
  if (tty === null) return "";
  const lines = createInterface({ input: createReadStream("", { fd: tty, autoClose: false }), output: process.stdout });
  const answer = await new Promise((done) => lines.question(question, done));
  lines.close();
  return answer.trim();
}

let dir;
const suggestion = join(homedir(), "Claude", `${slug}-remix`);
while (!dir) {
  const typed = await ask(`Where should it go? [${suggestion.replace(homedir(), "~")}] `);
  const chosen = resolve(typed ? typed.replace(/^~(?=$|\/)/, homedir()) : suggestion);
  if (existsSync(chosen) && readdirSync(chosen).length) {
    if (tty === null) fail(`${chosen} already has files in it.`);
    console.log(`${chosen} already has files in it. Pick an empty or new folder.`);
  } else dir = chosen;
}

const tree = await github(`/git/trees/${branch}:${found.prefix}?recursive=1`);
if (tree.truncated) fail("This prototype has too many files to copy.");
const files = tree.tree.filter((entry) => entry.type === "blob");

let copied = 0;
const queue = [...files];
async function next() {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const blob = await github(`/git/blobs/${file.sha}`);
    const target = join(dir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, Buffer.from(blob.content, "base64"));
    process.stdout.write(`\rCopying ${++copied}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, next));
process.stdout.write("\n");

if (existsSync(join(dir, "package.json"))) {
  console.log("Installing dependencies…");
  const pnpm = spawnSync("pnpm", ["--version"]).status === 0;
  spawnSync(pnpm ? "pnpm" : "npx", pnpm ? ["install", "--silent"] : ["-y", "pnpm@10.33.2", "install", "--silent"], {
    cwd: dir,
    stdio: "inherit",
  });
}

console.log(`\nA copy of ${found.name} ${found.version} is in ${dir}\nThe original is untouched.\n`);

const prompt = `This folder is a remix of "${found.name}" ${found.version} from Prototype Studio: an independent copy, so nothing I do here changes the original. Look through it and tell me in a sentence or two what it is, then ask what I want to change.${
  found.description ? ` (The original is described as: ${found.description})` : ""
}

When I'm ready to save it, use /push as a new prototype: don't pass --slug ${slug}, give it its own name, pass --team ${found.team}, and begin the description with "Remixed from ${found.name} ${found.version}."`;

// Claude needs the keyboard, and stdin is the pipe this was started from.
const claude = spawn("claude", [prompt], { cwd: dir, stdio: [tty ?? "inherit", "inherit", "inherit"] });
claude.on("error", () => {
  console.log(`Claude Code isn't installed here. Install it, then run:  cd ${dir} && claude`);
});
claude.on("exit", (code) => process.exit(code ?? 0));
