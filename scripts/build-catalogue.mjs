#!/usr/bin/env node
/**
 * Makes the components panel's pictures: one transparent WebP per component, from its first Storybook story.
 *
 *   node scripts/build-catalogue.mjs [--force]
 *
 * Storybook (started here if it isn't running) renders each story on its own page; a headless browser crops to the
 * component and keeps the background clear, so a picture dragged out of the panel is the component itself, not a
 * rectangle with a colour behind it. The pictures are kept on this machine, in
 * ~/.prototype-studio/catalogue/<production commit>-<stories>/, with a list file the panel reads, so opening the
 * panel makes no requests to the website and renders nothing.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const library = process.env.EVERY_WEBSITE_DIR ?? join(homedir(), "Claude", "every-website-main");
const conventions = join(homedir(), "Claude", "team-conventions", "storybook");
const root = join(homedir(), ".prototype-studio", "catalogue");
const force = process.argv.includes("--force");

const VIEWPORT = { width: 1024, height: 768 };
const SCALE = 2;
const MAX_WIDTH = 560;
const MAX_HEIGHT = 2400;
const PAD = 12;
const WORKERS = 4;

const walk = (folder) => (existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(folder, entry.name)) : [join(folder, entry.name)])) : []);

// Pictures are kept per production commit and per version of the stories, so a change to either makes new ones.
const sha = execFileSync("git", ["-C", library, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const storiesHash = createHash("sha1");
for (const file of walk(join(conventions, "src")).sort()) storiesHash.update(file).update(readFileSync(file));
const key = `${sha.slice(0, 7)}-${storiesHash.digest("hex").slice(0, 6)}`;
const folder = join(root, key);
if (!force && existsSync(join(folder, "manifest.json"))) {
  writeFileSync(join(root, "current.json"), JSON.stringify({ key }));
  console.log(`CATALOGUE: ${key} is already made.`);
  process.exit(0);
}

const up = async (port) => {
  try {
    return (await fetch(`http://localhost:${port}/index.json`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
};

// Its own Storybook, on its own port: whatever is on the usual one may be showing something else.
const port = 6007;
let started = null;
if (!(await up(port))) {
  execFileSync("node", [join(conventions, "sync.mjs"), "--add"], { stdio: "inherit" });
  started = spawn(join(library, "node_modules", ".bin", "storybook"), ["dev", "-c", ".storybook-studio", "-p", String(port), "--no-open"], { cwd: library, stdio: "ignore", detached: true });
  for (let waited = 0; !(await up(port)); waited += 1) {
    if (waited > 120) throw new Error("Storybook didn't start in time.");
    await new Promise((done) => setTimeout(done, 1000));
  }
}
const base = `http://localhost:${port}`;

// One picture per component: the story called Default if there is one, else the first.
const index = await (await fetch(`${base}/index.json`)).json();
const byTitle = new Map();
for (const entry of Object.values(index.entries)) {
  if (entry.type !== "story") continue;
  const kept = byTitle.get(entry.title);
  if (!kept) byTitle.set(entry.title, { entry, stories: 1 });
  else {
    kept.stories += 1;
    if (/^default$/i.test(entry.name) && !/^default$/i.test(kept.entry.name)) kept.entry = entry;
  }
}
const jobs = [...byTitle.values()].map(({ entry, stories }) => {
  const parts = entry.title.split("/");
  return { id: entry.id, title: entry.title, name: entry.name, label: parts.at(-1), group: parts.slice(0, -1).join(" / "), stories };
});

const { chromium } = createRequire(join(library, "package.json"))("@playwright/test");
// Playwright wants the browser build it shipped with; if that isn't installed, an older one that is will do for a screenshot.
const browser = await chromium.launch().catch(async () => {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  const installed = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort().reverse() : [];
  const executablePath = installed.map((name) => join(cache, name, "chrome-headless-shell-mac-arm64", "chrome-headless-shell")).find((path) => existsSync(path));
  if (!executablePath) throw new Error("No browser for Playwright: run `npx playwright install chromium` in ~/Claude/every-website-main.");
  return chromium.launch({ executablePath });
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });

/** The union of everything drawn inside the story, in the page's own pixels. */
const measure = () => {
  const story = document.querySelector("#storybook-root");
  if (!story || !story.children.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const element of story.querySelectorAll("*")) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    left = Math.min(left, box.left + window.scrollX);
    top = Math.min(top, box.top + window.scrollY);
    right = Math.max(right, box.right + window.scrollX);
    bottom = Math.max(bottom, box.bottom + window.scrollY);
  }
  return Number.isFinite(left) ? { left, top, right, bottom } : null;
};

async function shoot(job) {
  const page = await context.newPage();
  try {
    await page.goto(`${base}/iframe.html?id=${job.id}&viewMode=story`, { waitUntil: "load", timeout: 30000 });
    await page.addStyleTag({ content: "html,body,#storybook-root,#storybook-docs,.sb-show-main{background:transparent!important}" });
    await page.waitForFunction(() => document.querySelector("#storybook-root")?.children.length || document.body.classList.contains("sb-show-errordisplay"), null, { timeout: 15000 });
    if (await page.evaluate(() => document.body.classList.contains("sb-show-errordisplay"))) throw new Error("the story errored");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const box = await page.evaluate(measure);
    if (!box) throw new Error("nothing drawn");
    const x = Math.max(0, Math.floor(box.left - PAD));
    const y = Math.max(0, Math.floor(box.top - PAD));
    const width = Math.min(Math.ceil(box.right + PAD) - x, 4096);
    const height = Math.min(Math.ceil(box.bottom + PAD) - y, MAX_HEIGHT);
    if (width < 4 || height < 4) throw new Error("too small to show");
    const png = await page.screenshot({ clip: { x, y, width, height }, fullPage: true, omitBackground: true });
    const out = await sharp(png).resize({ width: Math.min(width * SCALE, MAX_WIDTH), withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 100, effort: 5 }).toBuffer({ resolveWithObject: true });
    const file = `${job.id}.webp`;
    writeFileSync(join(folder, file), out.data);
    return { ...job, file, width, height, bytes: out.data.length };
  } catch (error) {
    return { ...job, file: null, width: 0, height: 0, error: error instanceof Error ? error.message.split("\n")[0] : String(error) };
  } finally {
    await page.close();
  }
}

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (next < jobs.length) results.push(await shoot(jobs[next++]));
  }),
);
await browser.close();
if (started?.pid) {
  try {
    process.kill(-started.pid);
  } catch {}
  execFileSync("node", [join(conventions, "sync.mjs"), "--remove"], { stdio: "ignore" });
}

results.sort((a, b) => a.title.localeCompare(b.title));
const made = results.filter((item) => item.file);
writeFileSync(join(folder, "manifest.json"), JSON.stringify({ key, sha, builtAt: new Date().toISOString(), items: results.map(({ bytes: _bytes, ...item }) => item) }));
writeFileSync(join(root, "current.json"), JSON.stringify({ key }));
const total = made.reduce((sum, item) => sum + item.bytes, 0);
console.log(`CATALOGUE: ${made.length} of ${results.length} components pictured, ${(total / 1024).toFixed(0)} KB in all, in ${folder}`);
for (const item of results.filter((item) => item.error)) console.log(`  no picture: ${item.title}: ${item.error}`);
