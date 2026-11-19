// A design QA's dev server, on a second port, in a form the studio can frame: the same pages, with the one header that stops that taken out.
// The website only lets VWO's and Storyblok's editors embed it (`frame-ancestors`), so a browser tab shows it and the studio's frame is refused.
// Nothing else is changed, so what it shows is what the dev server serves, with one addition: the dev server draws a page afresh every time it is
// asked (seconds, for this site) and tells the browser never to keep it, so the page is kept here and given back at once. It is thrown away the
// moment a file of the branch changes, and a hard reload draws it again, so what it gives is never older than the code.
// Local only: node qa-frame-proxy.mjs <this port> <the dev server's port> <the branch's folder>.
import { watch } from "node:fs";
import http from "node:http";
import net from "node:net";
import { join } from "node:path";

const [listen, target] = process.argv.slice(2, 4).map(Number);
const folder = process.argv[4];
if (!listen || !target) throw new Error("Usage: qa-frame-proxy.mjs <listen port> <target port> [folder]");

const KEEP_MOST = 20;
/** The parameters the studio adds to a page's address (see `lib/controls.ts`): the page is the same with or without them. */
const STUDIO_PARAMS = ["preview", "studio"];
/**
 * Cookies the page doesn't depend on, left out of what a kept page is known by. The site's tags (VWO, Klaviyo, Google, Segment…) rewrite
 * theirs on every visit, so with them in, the tile and the opened page never matched and every load was drawn again. They all start with
 * one underscore, and the site's server reads none of them (its own are `session`, `every_…` and two with a double underscore);
 * `__next_hmr_refresh_hash__` is the dev server's own, and moves when any app on localhost reloads.
 */
const NOISE = /^(_[^_]|__kla|__next_hmr|ajs_)/;
const kept = new Map();
/** Pages being drawn now, with who else is waiting for the same one: opening a tile while it is still loading waits for that, not a second draw. */
const drawing = new Map();
/** Moves on every change of the branch, so a page that was being drawn while a file changed isn't kept. */
let generation = 0;
let watching = false;
if (folder) {
  try {
    for (const dir of ["src", "public"])
      watch(join(folder, dir), { recursive: true }, () => {
        kept.clear();
        generation += 1;
      });
    watching = true;
  } catch {
    // Without a watch nothing is kept (below), which is always right.
  }
}
/** The key of a page that may be kept: a plain request for a document. Null for anything else. */
function keyOf(request) {
  if (!watching || request.method !== "GET" || request.headers.range || request.headers.rsc) return null;
  if (!String(request.headers.accept ?? "").includes("text/html")) return null;
  const url = new URL(request.url, "http://x");
  if (url.pathname.startsWith("/_next") || url.pathname.startsWith("/api")) return null;
  for (const name of STUDIO_PARAMS) url.searchParams.delete(name);
  const cookies = String(request.headers.cookie ?? "")
    .split(/;\s*/)
    .filter((pair) => pair && !NOISE.test(pair))
    .sort()
    .join("; ");
  return `${url.pathname}?${url.searchParams}|${cookies}|${request.headers["accept-language"] ?? ""}`;
}

/** A hard reload (no-cache) asks for the page drawn again. A plain reload (max-age=0) doesn't need it: the page is only kept while the code is unchanged. */
const fresh = (request) => /no-cache/i.test(`${request.headers["cache-control"] ?? ""} ${request.headers.pragma ?? ""}`);

function open(headers) {
  const out = { ...headers };
  delete out["x-frame-options"];
  if (out["content-security-policy"]) out["content-security-policy"] = String(out["content-security-policy"]).replace(/frame-ancestors[^;]*/i, "frame-ancestors *");
  return out;
}

const send = (response, page) => {
  response.writeHead(page.status, page.headers);
  response.end(page.body);
};

const server = http.createServer((request, response) => {
  const key = keyOf(request);
  if (key && !fresh(request)) {
    const hit = kept.get(key);
    if (hit) return send(response, { ...hit, headers: { ...hit.headers, "x-qa-cache": "hit" } });
    const waiting = drawing.get(key);
    if (waiting) return void waiting.push(response);
  }
  const waiting = [response];
  if (key) drawing.set(key, waiting);
  const started = generation;
  const done = (page) => {
    if (key && drawing.get(key) === waiting) drawing.delete(key);
    for (const one of waiting) send(one, page);
  };

  const upstream = http.request({ host: "127.0.0.1", port: target, path: request.url, method: request.method, headers: request.headers }, (answer) => {
    const headers = open(answer.headers);
    if (!key) {
      response.writeHead(answer.statusCode ?? 502, headers);
      answer.pipe(response);
      return;
    }
    const chunks = [];
    answer.on("data", (chunk) => chunks.push(chunk));
    answer.on("end", () => {
      const body = Buffer.concat(chunks);
      delete headers["transfer-encoding"];
      headers["content-length"] = String(body.length);
      const page = { status: answer.statusCode ?? 502, headers, body };
      if (page.status === 200 && String(headers["content-type"] ?? "").includes("text/html") && started === generation) {
        kept.delete(key);
        kept.set(key, page);
        while (kept.size > KEEP_MOST) kept.delete(kept.keys().next().value);
      }
      done(page);
    });
  });
  upstream.on("error", () => {
    const page = { status: 502, headers: { "content-type": "text/plain" }, body: "The dev server isn't answering." };
    if (key) done(page);
    else send(response, page);
  });
  request.pipe(upstream);
});

// The dev server's live updates are a web socket: passed straight through.
server.on("upgrade", (request, socket, head) => {
  const upstream = net.connect(target, "127.0.0.1", () => {
    const lines = Object.entries(request.headers).map(([name, value]) => `${name}: ${value}`);
    upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(listen);
