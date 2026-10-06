/**
 * Takes the picture a prototype's tile shows in Prototype Studio.
 *
 * For every version under p/<slug>/<version>/ that has an index.html and no
 * studio-preview.jpg yet, serve the folder on a local port, open it in
 * Chromium at phone size and save a small JPEG beside the files. Versions are
 * never replaced, so a picture, once taken, is final — and finding the
 * versions that are missing one, rather than diffing the push, means anything
 * the workflow missed or couldn't render gets picked up on the next run.
 *
 * The entry is served at "/" the way the studio serves it, and video and
 * audio are blocked the way the studio's own preview blocks them, so the
 * picture matches what a tile would have shown.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const WIDTH = 390;
const HEIGHT = 844;
// A little over the size a tile shows it, so it stays sharp on a retina screen.
const OUTPUT_WIDTH = 480;
// After the load event, a moment for fonts, images and entrance animations.
const SETTLE_MS = 2000;
// Per run, so a first run over a big backlog stays inside the time limit.
const MAX_PER_RUN = 40;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const dirs = (path) =>
  existsSync(path) ? readdirSync(path).filter((name) => statSync(join(path, name)).isDirectory()) : [];

const pending = [];
for (const slug of dirs("p")) {
  for (const version of dirs(join("p", slug))) {
    const dir = join("p", slug, version);
    if (existsSync(join(dir, "index.html")) && !existsSync(join(dir, "studio-preview.jpg"))) pending.push(dir);
  }
}

console.log(`${pending.length} version(s) without a preview.`);
if (pending.length === 0) process.exit(0);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let taken = 0;

for (const dir of pending.slice(0, MAX_PER_RUN)) {
  const root = join(process.cwd(), dir);
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
    const file = join(root, path === "/" ? "index.html" : path);
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      ...(path === "/" ? { "content-security-policy": "media-src 'none'" } : {}),
    });
    response.end(readFileSync(file));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: OUTPUT_WIDTH / WIDTH,
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(root, "studio-preview.jpg"), type: "jpeg", quality: 78 });
    taken += 1;
    console.log(`  ${dir}`);
  } catch (error) {
    // One prototype that won't render shouldn't stop the rest.
    console.warn(`  ${dir} — skipped: ${error.message.split("\n")[0]}`);
  } finally {
    await context.close();
    server.close();
  }
}

await browser.close();
console.log(`Took ${taken} preview(s).`);
