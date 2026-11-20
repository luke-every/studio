/**
 * The studio's local helper. It does the two things a web page can't: run `claude` in a prototype's folder (the terminal
 * panel), and start a new prototype (the New prototype dialog, which runs the /newprototype script).
 *
 * The terminal: one shell per prototype, in its folder, running `claude`.
 * Local only. It listens on 127.0.0.1 and takes a connection only from the studio's own page, so a deployed
 * studio (or any other site) can never reach it. A session outlives the panel: closing it, reloading or moving to
 * another prototype leaves the shell running, and the next connection gets the recent screen back.
 *
 *   node scripts/terminal-server.mjs        (scripts/com.luke.prototype-studio-terminal.plist runs it on login)
 */
import { spawn as run } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { spawn } from "node-pty";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.TERMINAL_PORT ?? 4748);
const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 4747);
const ALLOWED_ORIGINS = new Set([`http://localhost:${STUDIO_PORT}`, `http://127.0.0.1:${STUDIO_PORT}`]);
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ROOT = process.env.PROTOTYPES_DIR ?? join(homedir(), "Claude", "prototypes");
const QA_ROOT = join(homedir(), "Claude", "design-qa");
const QA_PREFIX = "qa-";
const CONVENTIONS = join(homedir(), "Claude", "team-conventions");
const SCAFFOLD = join(homedir(), ".claude", "skills", "newprototype", "scaffold.sh");
/** How much of the screen a reconnecting panel gets back. */
const KEEP = 200_000;

// npm doesn't run node-pty's install script, which is what makes its macOS helper executable. Without that, no shell can start.
const prebuilds = join(dirname(createRequire(import.meta.url).resolve("node-pty/package.json")), "prebuilds");
for (const target of existsSync(prebuilds) ? readdirSync(prebuilds) : []) {
  try {
    chmodSync(join(prebuilds, target, "spawn-helper"), 0o755);
  } catch {}
}

// What a shell or a script started here is given. A Claude Code session that started this helper (a login item has none) leaves
// its own CLAUDE_* variables in it: the session id, a messaging socket and CLAUDE_CODE_CHILD_SESSION, which makes every `claude`
// opened in the panel think it is that session's child (and stops it saving its transcript). What you set in ~/.zshrc is
// exported again by the shell itself.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^CLAUDE/i.test(name)));

// What the studio selected in the prototype reaches Claude through two hooks (scripts/studio-hook.mjs), which only the sessions
// started here load, with `claude --settings`: as a prompt is sent, the hook asks this helper what is selected and Claude
// Code adds it to the prompt; as Claude finishes, the hook says so. The token keeps anything but those hooks from calling them.
const HOOK_TOKEN = process.env.STUDIO_HOOK_TOKEN ?? randomUUID();
const hook = (kind) => ({ hooks: [{ type: "command", command: `"${process.execPath}" "${join(dirname(fileURLToPath(import.meta.url)), "studio-hook.mjs")}" ${kind}`, timeout: 5 }] });
const SETTINGS = JSON.stringify({ hooks: { UserPromptSubmit: [hook("prompt")], Stop: [hook("stop")] } });
/** A Claude that is working keeps its screen moving (a spinner); this long without a change and it is taken to have stopped (an interrupt runs no hook). */
const QUIET = 5000;

/** A session outlives its panel, so a prototype's Claude carries on while someone looks elsewhere; this long with no panel open and it is let go, so a shell and a Claude are not kept for every prototype ever opened. */
const IDLE = 30 * 60_000;

/** slug -> { pty, tail, sockets, selection, delivered, working, quiet, idle }. */
const sessions = new Map();

/** Tells the panels of a session something that isn't the shell's output: sent as `\0` and JSON. */
const tell = (session, message) => {
  for (const socket of session.sockets) socket.send(`\0${JSON.stringify(message)}`);
};
/** Called whenever a panel leaves (and when a session starts): after IDLE with none open and Claude not at work, the session ends. */
function watchIdle(session) {
  clearTimeout(session.idle);
  if (session.sockets.size) return;
  session.idle = setTimeout(() => (session.sockets.size || session.working ? watchIdle(session) : session.pty.kill()), IDLE);
}
function working(session, on) {
  clearTimeout(session.quiet);
  if (on) session.quiet = setTimeout(() => working(session, false), QUIET);
  if (session.working === on) return;
  session.working = on;
  tell(session, { working: on });
}

const folderOf = (slug) => (slug.startsWith(QA_PREFIX) ? join(QA_ROOT, slug.slice(QA_PREFIX.length)) : join(ROOT, slug));

function sessionFor(slug, cols, rows) {
  const live = sessions.get(slug);
  if (live) return live;
  // Interactive and login, like a Terminal window, so ~/.zshrc runs: that is where `claude` gets onto the PATH and where nvm
  // is loaded. Quitting claude leaves a shell, not a dead panel.
  const pty = spawn(process.env.SHELL || "/bin/zsh", ["-ilc", 'claude --settings "$STUDIO_SETTINGS"; exec $SHELL -l'], {
    name: "xterm-256color",
    cols,
    rows,
    cwd: folderOf(slug),
    env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor", STUDIO_SLUG: slug, STUDIO_HOOK_TOKEN: HOOK_TOKEN, STUDIO_HELPER: `127.0.0.1:${PORT}`, STUDIO_SETTINGS: SETTINGS },
  });
  const session = { pty, tail: "", sockets: new Set(), selection: null, delivered: false, working: false, quiet: undefined, idle: undefined };
  pty.onData((data) => {
    session.tail = (session.tail + data).slice(-KEEP);
    for (const socket of session.sockets) socket.send(data);
    // Still moving: still working.
    if (session.working) working(session, true);
  });
  pty.onExit(() => {
    clearTimeout(session.quiet);
    clearTimeout(session.idle);
    for (const socket of session.sockets) socket.send("\r\n\x1b[2mThe session ended. Close the panel and open it again to start a new one.\x1b[0m\r\n");
    sessions.delete(slug);
  });
  sessions.set(slug, session);
  watchIdle(session);
  return session;
}

/** What a new prototype can start from: the templates in team-conventions, then the bare starter. */
function templates() {
  const dir = join(CONVENTIONS, "templates");
  const names = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && SLUG.test(entry.name)).map((entry) => entry.name) : [];
  const preferred = existsSync(join(dir, ".default")) ? readFileSync(join(dir, ".default"), "utf8").trim() : "";
  // The first sentence of the README's first paragraph says what it is.
  const about = (name) => {
    try {
      const line = readFileSync(join(dir, name, "README.md"), "utf8").split("\n").find((text) => text.trim() && !text.startsWith("#")) ?? "";
      return line.trim().split(/(?<=\.)\s/)[0];
    } catch {
      return "";
    }
  };
  return {
    templates: [...names.map((name) => ({ name, about: about(name) })), { name: "blank", about: "The starter page: a heading, a few tags and a button." }],
    default: names.includes(preferred) ? preferred : "blank",
  };
}

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");

/** The request to make a prototype, or null if it isn't a sensible one. Nothing from it ever reaches a shell as text. */
function checkNew(params) {
  const name = (params.get("name") ?? "").trim();
  const template = params.get("template") ?? "";
  const team = params.get("team") ?? "";
  const base = slugify(name);
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name) || !base || base.startsWith(QA_PREFIX)) return null;
  if (!templates().templates.some((item) => item.name === template) || (team && !SLUG.test(team))) return null;
  return { name, template, team, base };
}

// The script wants the licensed fonts in the starter. If this machine's copy has lost some, take them from a prototype that has them.
function restoreFonts() {
  const into = join(CONVENTIONS, "starter", "public", "fonts");
  const wanted = [["ABCDiatype-Regular.woff2"], ["ABCDiatype-Medium.woff2"], ["ABCDiatype-Bold.woff2"], ["ABCMarist-Book.woff2"], ["ABCMarist-BookItalic.woff2", "Marist-Book-Italic.woff2"]];
  const homes = existsSync(ROOT) ? readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => join(ROOT, entry.name, "public", "fonts")) : [];
  for (const names of wanted) {
    if (names.some((name) => existsSync(join(into, name)))) continue;
    for (const home of homes) {
      const found = names.find((name) => existsSync(join(home, name)));
      if (!found) continue;
      mkdirSync(into, { recursive: true });
      copyFileSync(join(home, found), join(into, names[0]));
      break;
    }
  }
}

/**
 * Runs the /newprototype script for a new folder in ~/Claude/prototypes, telling the dialog which step it is on (read off
 * what is on disk, not guessed) and, at the end, the folder's name. The studio's name and team for it are kept in
 * `.studio/new.json`. Closing the dialog doesn't stop it: the prototype just turns up.
 */
async function createPrototype(ws, { name, template, team, base }) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  let slug = base;
  for (let n = 2; existsSync(join(ROOT, slug)); n++) slug = `${base}-${n}`;
  const dir = join(ROOT, slug);
  const log = join(process.env.TMPDIR || "/tmp", `${slug}-dev.log`);
  try {
    restoreFonts();
  } catch {}

  // Interactive and login, like the terminal, so pnpm, gh and nvm are on the PATH.
  const child = run(process.env.SHELL || "/bin/zsh", ["-ilc", 'exec bash "$SCAFFOLD" "$TEMPLATE" --dir "$TARGET"'], {
    env: { ...env, SCAFFOLD, TEMPLATE: template, TARGET: dir, PROTOTYPES_DIR: ROOT },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => (output += data));
  child.stderr.on("data", (data) => (output += data));

  let step = "";
  const tell = (next) => {
    if (next !== step) say({ step: (step = next) });
  };
  tell("Updating conventions");
  const watch = setInterval(() => {
    if (existsSync(log)) tell("Starting the preview");
    else if (existsSync(join(dir, "package.json"))) tell("Installing");
    else if (existsSync(dir)) tell("Copying the template");
  }, 400);

  child.on("close", (code) => {
    clearInterval(watch);
    const lines = output.split("\n").map((line) => line.trim());
    const found = (prefix) => lines.find((line) => line.startsWith(prefix))?.slice(prefix.length).trim();
    const fonts = found("FONTS MISSING");
    if (code !== 0 || fonts) {
      const reason = fonts
        ? `Fonts are missing. Add the .woff2 files to ~/Claude/team-conventions/starter/public/fonts and try again.`
        : (found("ERROR:") ?? "The setup stopped before it finished.");
      return say({ error: reason });
    }
    try {
      mkdirSync(join(dir, ".studio"), { recursive: true });
      writeFileSync(join(dir, ".studio", "new.json"), JSON.stringify({ name, team: team || undefined }, null, 2));
    } catch {}
    say({ done: { slug } });
  });
}

// A plain GET is the studio asking whether this prototype can have a terminal: 204 if so, 404 if not. The button is shown on that.
// `/templates` is the same question for the New prototype button, and answers with what it can start from.
const server = createServer((request, response) => {
  const origin = request.headers.origin ?? "";
  const url = new URL(request.url ?? "/", "http://terminal");
  const ours = ALLOWED_ORIGINS.has(origin) && ALLOWED_HOSTS.has(request.headers.host ?? "");
  if (ours && url.pathname === "/templates") {
    response.writeHead(200, { "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" }).end(JSON.stringify(templates()));
    return;
  }
  const slug = url.searchParams.get("slug") ?? "";
  // The studio says what is selected in the prototype (a line of words, or nothing to let it go). Plain text, so it is no preflighted request.
  if (ours && request.method === "POST" && url.pathname === "/selection" && SLUG.test(slug)) {
    let body = "";
    request.on("data", (chunk) => body.length < 4096 && (body += chunk));
    request.on("end", () => {
      const session = sessions.get(slug);
      const line = body.trim().slice(0, 1000);
      if (session) {
        session.selection = line || null;
        session.delivered = false;
      }
      response.writeHead(204, { "Access-Control-Allow-Origin": origin }).end();
    });
    return;
  }
  // The hooks of a session started here: what to add to a prompt, and that Claude has finished.
  if (request.method === "POST" && url.pathname.startsWith("/hook/") && request.headers["x-studio-hook"] === HOOK_TOKEN && SLUG.test(slug)) {
    const session = sessions.get(slug);
    let said = "";
    if (session && url.pathname === "/hook/prompt") {
      working(session, true);
      // Told once: Claude keeps it for the rest of the conversation. Choosing again, even the same element, tells it again.
      if (session.selection && !session.delivered) {
        session.delivered = true;
        said = `The user's current selection in the prototype preview (what "this" and "these" refer to): ${session.selection}`;
      }
    } else if (session && url.pathname === "/hook/stop") {
      working(session, false);
    }
    response.writeHead(200, { "Content-Type": "text/plain" }).end(said);
    return;
  }
  // A POST to /end stops a prototype's session: the panel's Stop button, and deleting the prototype.
  if (ours && request.method === "POST" && url.pathname === "/end" && SLUG.test(slug)) {
    sessions.get(slug)?.pty.kill();
    response.writeHead(204, { "Access-Control-Allow-Origin": origin }).end();
    return;
  }
  const ok = ours && SLUG.test(slug) && existsSync(folderOf(slug));
  response.writeHead(ok ? 204 : 404, ok ? { "Access-Control-Allow-Origin": origin } : {}).end();
});
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const refuse = () => socket.destroy();
  // The page that opened it must be the studio's own, and the address must be ours (a DNS-rebinding page would carry its own name).
  if (!ALLOWED_ORIGINS.has(request.headers.origin ?? "") || !ALLOWED_HOSTS.has(request.headers.host ?? "")) return refuse();
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  if (url.pathname === "/new") {
    const wanted = checkNew(url.searchParams);
    if (!wanted) return refuse();
    return wss.handleUpgrade(request, socket, head, (ws) => void createPrototype(ws, wanted));
  }
  const slug = url.searchParams.get("slug") ?? "";
  if (!SLUG.test(slug) || !existsSync(folderOf(slug))) return refuse();
  const cols = Math.max(20, Number(url.searchParams.get("cols")) || 80);
  const rows = Math.max(5, Number(url.searchParams.get("rows")) || 24);
  wss.handleUpgrade(request, socket, head, (ws) => {
    const fresh = !sessions.has(slug);
    let session;
    try {
      session = sessionFor(slug, cols, rows);
    } catch (error) {
      ws.send(`\x1b[2mCouldn't start a shell: ${error instanceof Error ? error.message : error}\x1b[0m\r\n`);
      ws.close();
      return;
    }
    if (!fresh) {
      session.pty.resize(cols, rows);
      ws.send(session.tail);
    }
    session.sockets.add(ws);
    clearTimeout(session.idle);
    if (session.working) ws.send(`\0${JSON.stringify({ working: true })}`);
    ws.on("message", (message, binary) => {
      const text = message.toString();
      // A resize is the one thing that isn't typing: `\0{"cols":..,"rows":..}`.
      if (!binary && text.startsWith("\0")) {
        try {
          const size = JSON.parse(text.slice(1));
          if (Number.isInteger(size.cols) && Number.isInteger(size.rows) && size.cols > 0 && size.rows > 0) session.pty.resize(size.cols, size.rows);
        } catch {}
        return;
      }
      session.pty.write(text);
    });
    ws.on("close", () => (session.sockets.delete(ws), watchIdle(session)));
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`Terminal on 127.0.0.1:${PORT}, for the studio on :${STUDIO_PORT}`));
