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
import { execFileSync, spawn as run } from "node:child_process";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, dirname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import { spawn } from "node-pty";
import { WebSocketServer } from "ws";

import { extractSection, snapshotSection } from "./extract-section.mjs";
import { forkNested } from "./fork-nested.mjs";
import { ensureTagging } from "./tag-source.mjs";

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
const PRODUCTION = process.env.EVERY_WEBSITE_DIR ?? join(homedir(), "Claude", "every-website-main");
const KITS = join(CONVENTIONS, "starter", "optional-stubs");
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
// What a terminal, a push or a dev server starts with. Not the studio's own `NODE_ENV` and Next variables, which this process inherits when the studio starts it: a prototype's `next build` run
// with `NODE_ENV=development` fails on `/_global-error`.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(CLAUDE|NEXT_|__NEXT|NODE_ENV$)/i.test(name)));

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
  // A project is a folder with nothing in it yet but a canvas: no template, no install.
  const project = params.get("kind") === "project";
  // A template added to a project that has none: the folder is already there, holding only the studio's note.
  if (params.get("kind") === "template") {
    const slug = params.get("slug") ?? "";
    const note = SLUG.test(slug) ? join(ROOT, slug, ".studio", "new.json") : "";
    let made;
    try {
      made = note ? JSON.parse(readFileSync(note, "utf8")) : null;
    } catch {
      made = null;
    }
    if (!made?.blank || !templates().templates.some((item) => item.name === template)) return null;
    return { name: made.name ?? slug, template, team: made.team ?? "", base: slug, existing: slug };
  }
  if (!name || name.length > 80 || /[\u0000-\u001f]/.test(name) || !base || base.startsWith(QA_PREFIX)) return null;
  if ((!project && !templates().templates.some((item) => item.name === template)) || (team && !SLUG.test(team))) return null;
  return { name, template, team, base, project };
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
async function createPrototype(ws, { name, template, team, base, project, existing }) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  let slug = base;
  if (!existing) for (let n = 2; existsSync(join(ROOT, slug)); n++) slug = `${base}-${n}`;
  const dir = join(ROOT, slug);
  if (project) {
    // Instant: the folder and the studio's note about it. Dropping a template on its canvas fills it in later.
    try {
      mkdirSync(join(dir, ".studio"), { recursive: true });
      writeFileSync(join(dir, ".studio", "new.json"), JSON.stringify({ name, team: team || undefined, blank: true }, null, 2));
    } catch {
      return say({ error: "Couldn't make the folder in ~/Claude/prototypes." });
    }
    return say({ done: { slug } });
  }
  const log = join(process.env.TMPDIR || "/tmp", `${slug}-dev.log`);
  try {
    restoreFonts();
  } catch {}

  // The script wants an empty folder: the studio's note is set aside while it runs, and put back whatever happens.
  const aside = existing ? join(process.env.TMPDIR || "/tmp", `${slug}-studio-aside`) : "";
  if (existing) {
    rmSync(aside, { recursive: true, force: true });
    cpSync(join(dir, ".studio"), aside, { recursive: true });
    rmSync(join(dir, ".studio"), { recursive: true, force: true });
  }

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
    if (existing) {
      mkdirSync(join(dir, ".studio"), { recursive: true });
      cpSync(aside, join(dir, ".studio"), { recursive: true });
      rmSync(aside, { recursive: true, force: true });
    }
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
      // It is a prototype now: no longer only a canvas.
      writeFileSync(join(dir, ".studio", "new.json"), JSON.stringify({ name, team: team || undefined }, null, 2));
    } catch {}
    say({ done: { slug } });
  });
}

/** Where a component's own file is, from what the stage's list says: the website's clone (`production:<path>`) or one of the templates' kits (`kit:<kit>:<path>`). Null outside them. */
function sourceFile(spec) {
  const [where, ...rest] = String(spec).split(":");
  const [root, path] = where === "production" ? [PRODUCTION, rest.join(":")] : where === "kit" ? [join(KITS, rest[0] ?? ""), rest.slice(1).join(":")] : [null, ""];
  if (!root || !path) return null;
  const file = normalize(join(root, path));
  return file.startsWith(root + sep) && existsSync(file) ? file : null;
}

const commitOf = (repo) => {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

/** The preview a copy is drawn by: `/studio-stage?id=<component>&props=<json>`, the component alone, as wide as the frame it is in. */
const STAGE_PAGE = `"use client";

import { Component as ReactComponent, Fragment, Suspense, createElement, useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { elementTypes, forks } from "@/lib/studio-forks";

// What a copy is drawn with was captured as plain data (the studio's capture-props.ts): a function is {"$fn":true}, a date {"$date"}, and markup (children)
// a description, {"$el", props, children}, which is built again here from the components named in elementTypes.
function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (object.$fn === true) return () => {};
    if (typeof object.$date === "string") return new Date(object.$date);
    if (typeof object.$el === "string") {
      const named = object.$el;
      const type = named === "Fragment" ? Fragment : (elementTypes[named] ?? (/^[a-z]/.test(named) ? named : null));
      if (!type) return null;
      const inside = object.children === undefined ? [] : ([] as unknown[]).concat(revive(object.children));
      return createElement(type as never, revive(object.props) as never, ...(inside as ReactNode[]));
    }
    return Object.fromEntries(Object.entries(object).map(([key, one]) => [key, revive(one)]));
  }
  return value;
}

// A copy that can't be drawn alone (it needs something its parent gave it, such as a context) says so, and does not take the page down with it.
class Boundary extends ReactComponent<{ children: ReactNode }, { problem: string | null }> {
  state = { problem: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { problem: error instanceof Error ? error.message : "It stopped." };
  }
  render() {
    return this.state.problem ? <p style={{ padding: 24, font: "14px system-ui" }}>This copy can&apos;t be drawn on its own: {this.state.problem}</p> : this.props.children;
  }
}

// Written by the studio (Fork on a component): the copies this project has made, drawn alone. It says how big the copy is (the canvas asks, and
// is told again when it changes), so the layer on the canvas is as big as the copy.
function useReportSize(box: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = box.current;
    if (!node) return undefined;
    let last = "";
    const report = () => {
      const rect = node.getBoundingClientRect();
      let right = rect.right;
      let bottom = rect.bottom;
      for (const inner of Array.from(node.querySelectorAll("*"))) {
        const inside = inner.getBoundingClientRect();
        if (inside.width && inside.height) {
          right = Math.max(right, inside.right);
          bottom = Math.max(bottom, inside.bottom);
        }
      }
      const width = Math.min(Math.ceil(right - rect.left), 4000);
      const height = Math.min(Math.ceil(bottom - rect.top), 4000);
      if (!width || !height || width + "x" + height === last) return;
      last = width + "x" + height;
      window.parent.postMessage({ type: "studio:stage-size", width, height }, "*");
    };
    const ask = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type !== "studio:stage-size:ask") return;
      last = "";
      report();
    };
    report();
    window.addEventListener("message", ask);
    const watch = new ResizeObserver(report);
    watch.observe(node);
    return () => {
      window.removeEventListener("message", ask);
      watch.disconnect();
    };
  }, [box]);
}

function Stage() {
  const box = useRef<HTMLDivElement>(null);
  useReportSize(box);
  // Words typed over inside an instance of a copy (the texts parameter): put on the elements that hold them once it has drawn.
  const typed = useSearchParams().get("texts") ?? "";
  useEffect(() => {
    if (!typed) return;
    try {
      for (const [selector, words] of Object.entries(JSON.parse(typed) as Record<string, string>)) {
        const element = document.querySelector(selector);
        if (element && typeof words === "string") element.textContent = words;
      }
    } catch {
      // Words that don't parse, or a selector that finds nothing, change nothing.
    }
  }, [typed]);
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const entry = forks[id];
  let over: Record<string, unknown> = {};
  try {
    over = JSON.parse(params.get("props") ?? "{}") as Record<string, unknown>;
  } catch {
    // Props that don't parse change nothing.
  }
  if (!entry) return <p style={{ padding: 24 }}>{id ? \`No copy of \${id} in this project.\` : "Choose a component."}</p>;
  const Component = entry.component;
  return (
    <>
      <style>{"html,body{background:transparent!important;margin:0}"}</style>
      <div data-stage ref={box} style={{ display: "block" }}>
        <Boundary>
          <Component {...(revive(entry.props) as Record<string, unknown>)} {...over} />
        </Boundary>
      </div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Stage />
    </Suspense>
  );
}
`;

/** The registry and the preview a project draws its copies by, written from `.studio/forks.json`'s records. */
function writeRegistry(dir, records) {
  mkdirSync(join(dir, "src", "lib"), { recursive: true });
  mkdirSync(join(dir, "src", "app", "studio-stage"), { recursive: true });
  const all = Object.entries(records);
  writeFileSync(
    join(dir, "src", "lib", "studio-forks.ts"),
    `// Written by the studio from .studio/forks.json: the copies of components this project has made, and the props each starts with.\nimport type { ComponentType } from "react";\n\n${[...new Set(all.flatMap(([, one]) => one.imports))].join("\n")}\n${all.map(([key, one]) => `import { ${one.exportName} as F_${key.replace(/[^A-Za-z0-9]/g, "_")} } from "@/components/forks/${one.folder}/${one.file}";`).join("\n")}\n\nexport const elementTypes: Record<string, ComponentType<Record<string, unknown>>> = {${[...new Set(all.flatMap(([, one]) => one.elementTypes ?? []))].map((type) => `\n  ${JSON.stringify(type)}: T_${type} as unknown as ComponentType<Record<string, unknown>>,`).join("")}\n};\n\nexport const forks: Record<string, { component: ComponentType<Record<string, unknown>>; props: Record<string, unknown> }> = {\n${all.map(([key, one]) => `  ${JSON.stringify(key)}: { component: F_${key.replace(/[^A-Za-z0-9]/g, "_")} as unknown as ComponentType<Record<string, unknown>>, props: ${one.baseline} },`).join("\n")}\n};\n`,
  );
  writeFileSync(join(dir, "src", "app", "studio-stage", "page.tsx"), STAGE_PAGE);
}

/**
 * Makes a copy of a component in a project, as Fork on an instance does: its file (and the files it imports from beside itself) into
 * `src/components/forks/<Name>/`, with a line at the top saying what it is a copy of; a record of it in `.studio/forks.json`, which is what
 * says "based on" to whoever reads the work; and the preview the studio draws it by. The original is never touched.
 */
async function forkComponent(ws, { slug, id }) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const dir = join(ROOT, slug);
  if (!existsSync(join(dir, "package.json"))) return say({ error: "Set the project up first: it has no app yet." });
  let entry;
  try {
    entry = JSON.parse(readFileSync(join(ROOT, "stage", "out", "components.json"), "utf8")).find((one) => one.id === id);
  } catch {
    return say({ error: "The components stage isn't built. Run npm run studio in ~/Claude/prototypes/stage." });
  }
  const from = entry?.fork ? sourceFile(entry.fork.source) : null;
  if (!entry?.fork || !from) return say({ error: "That component can't be copied." });
  try {
    say({ step: "Copying" });
    const folder = entry.label.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join("") || "Component";
    const target = join(dir, "src", "components", "forks", folder);
    mkdirSync(target, { recursive: true });
    const source = entry.fork.source;
    const commit = commitOf(source.startsWith("kit:") ? CONVENTIONS : PRODUCTION);
    const done = new Set();
    // The file, and what it imports as `./name` from beside itself, so it still runs where it is put.
    const bring = (file, first) => {
      if (done.has(file)) return;
      done.add(file);
      let text = readFileSync(file, "utf8");
      if (first) text = `// A copy of ${entry.label} (${source}${commit ? `, at ${commit}` : ""}) for this project. The original is not touched: what is changed here is what is proposed.\n${text}`;
      writeFileSync(join(target, basename(file)), text);
      for (const [, name] of text.matchAll(/from\s+["']\.\/([\w.-]+)["']/g)) {
        const beside = [".tsx", ".ts", ""].map((end) => join(dirname(file), name + end)).find((one) => existsSync(one) && !one.endsWith(sep));
        if (beside && /\.(tsx?|css)$/.test(beside)) bring(beside, false);
      }
    };
    bring(from, true);
    // Other files it needs (what its starting props are made from), put where they are asked for, and never over something already there.
    for (const spec of entry.fork.extra ?? []) {
      const [origin, destination] = String(spec).split(">");
      const file = sourceFile(origin);
      const to = normalize(join(dir, destination ?? ""));
      if (file && destination && to.startsWith(dir + sep) && !existsSync(to)) {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(file, to);
      }
    }
    // The record: what each copy is, what it is a copy of and when, and the starting props its preview is drawn with.
    const recordFile = join(dir, ".studio", "forks.json");
    mkdirSync(dirname(recordFile), { recursive: true });
    let records = {};
    try {
      records = JSON.parse(readFileSync(recordFile, "utf8"));
    } catch {
      records = {};
    }
    records[id] = { label: entry.label, folder, file: basename(from).replace(/\.tsx?$/, ""), exportName: entry.fork.exportName, baseline: entry.fork.baseline, imports: entry.fork.imports ?? [], from: { source, commit }, at: new Date().toISOString() };
    writeFileSync(recordFile, JSON.stringify(records, null, 2));
    writeRegistry(dir, records);
    // Each element of the copy is tagged with where it is written, so a change on the canvas is written to it. A project's server reads its config once: restart it after this.
    ensureTagging(dir);
    say({ done: { slug, id, label: entry.label } });
  } catch (error) {
    say({ error: `The copy couldn't be made: ${error instanceof Error ? error.message : "it stopped."}` });
  }
}

/**
 * Takes an element of a project's own code out into a component of its own (see `extract-section.mjs`), records it like any copy, and has the project draw it.
 * An element that needs what only the code around it has is not taken: it is said what it needs, which is for Claude.
 */
async function extractElement(ws, { slug, loc, name, exact, top, owners, markup }) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const dir = join(ROOT, slug);
  if (!existsSync(join(dir, "package.json"))) return say({ error: "Set the project up first: it has no app yet." });
  try {
    say({ step: "Taking it out" });
    const recordFile = join(dir, ".studio", "forks.json");
    let records = {};
    try {
      records = JSON.parse(readFileSync(recordFile, "utf8"));
    } catch {
      records = {};
    }
    const commits = { project: commitOf(CONVENTIONS), production: commitOf(PRODUCTION) };
    let made;
    try {
      made = extractSection({ dir, loc, name, records, followed: exact, top, owners, commits });
    } catch (error) {
      made = { error: `It couldn't be taken out: ${error instanceof Error ? error.message : "it stopped."}` };
    }
    // Whatever stops it being taken as code (it uses values only the code around it has, it has no place in this project's code, its file has changed), what the page is drawing is
    // still there: it is taken as that. The reason it couldn't be code is only said if the snapshot can't be made either.
    if (markup && (made.error || made.level === "C")) {
      const snapshot = snapshotSection({ dir, loc, name, markup, records, commits });
      if (!snapshot.error) made = snapshot;
    }
    if (made.error) return say({ error: made.error });
    if (made.level === "C") return say({ error: `${made.reason} Ask Claude to make it stand on its own first.` });
    records[made.id] = made.record;
    mkdirSync(dirname(recordFile), { recursive: true });
    writeFileSync(recordFile, JSON.stringify(records, null, 2));
    writeRegistry(dir, records);
    ensureTagging(dir);
    say({ done: { slug, id: made.id, label: records[made.id].label, ...(made.snapshot ? { snapshot: true } : {}) } });
  } catch (error) {
    say({ error: `It couldn't be taken out: ${error instanceof Error ? error.message : "it stopped."}` });
  }
}

/**
 * Makes a fork the owner of a component it uses (see `fork-nested.mjs`): the copy goes into the fork's folder and the fork is pointed at it, so a change made inside it is
 * the fork's, and not a change to the original that the rest of the prototype uses.
 */
async function forkNestedFor(ws, { slug, id, name }) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const dir = join(ROOT, slug);
  if (!existsSync(join(dir, "package.json"))) return say({ error: "Set the project up first: it has no app yet." });
  try {
    const recordFile = join(dir, ".studio", "forks.json");
    const records = JSON.parse(readFileSync(recordFile, "utf8"));
    if (!records[id]) return say({ error: "That fork isn't in this project's records." });
    const made = forkNested({ dir, record: records[id], name, commits: { project: commitOf(CONVENTIONS), production: commitOf(PRODUCTION) } });
    if (made.error) return say({ error: made.error });
    records[id] = made.record;
    writeFileSync(recordFile, JSON.stringify(records, null, 2));
    writeRegistry(dir, records);
    say({ done: { slug, id, label: name } });
  } catch (error) {
    say({ error: `It couldn't be copied: ${error instanceof Error ? error.message : "it stopped."}` });
  }
}

const PUSH = join(homedir(), ".claude", "skills", "push", "push.mjs");

/**
 * The notes for a push, drafted by Claude from the prototype's own session: a one-shot `claude -p` that continues the
 * folder's latest conversation as a fork (so the open session is never touched) and has no tools, only words. Settles with
 * empty notes when there is no conversation to read or Claude fails: the dialog then just has blank fields.
 */
function draftNotes(folder, abort) {
  const prompt =
    'Write the notes for saving this prototype as a new version in the studio, from what happened in this session. ' +
    'Reply with only a JSON object: {"title": string, "changes": string}. ' +
    'title: a short headline for this version, a handful of words ("Tighter results layout", not "Update"). ' +
    'changes: what is new or different, in two or three sentences or a few short lines, and where it is not obvious what it was trying to fix. ' +
    "Write only from what actually happened here; don't invent a rationale you weren't given, don't pad, never write \"various improvements\". " +
    'If nothing was changed in this session, return empty strings.';
  return new Promise((resolve) => {
    const child = run(process.env.SHELL || "/bin/zsh", ["-ilc", 'exec claude -p "$NOTES_PROMPT" --continue --fork-session --tools ""'], {
      cwd: folder,
      env: { ...env, NOTES_PROMPT: prompt },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (data) => output.length < 20000 && (output += data));
    const timer = setTimeout(() => child.kill(), 90_000);
    abort.addEventListener("abort", () => child.kill());
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const found = JSON.parse(output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1));
        resolve({ title: String(found.title ?? "").trim().slice(0, 120), changes: String(found.changes ?? "").trim().slice(0, 2000) });
      } catch {
        resolve({ title: "", changes: "" });
      }
    });
  });
}

/**
 * Runs /push's script for a prototype's folder with the notes the dialog sends as its first message, telling the dialog
 * which step it is on (read off what the script prints) and, at the end, the version it became. Closing the dialog doesn't
 * stop it: the version just turns up.
 */
function pushPrototype(ws, slug) {
  const say = (message) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  ws.once("message", (data) => {
    let asked;
    try {
      asked = JSON.parse(String(data));
    } catch {
      return ws.close();
    }
    const text = (key, max) => (typeof asked[key] === "string" ? asked[key].trim().slice(0, max) : "");
    const [name, team, version, title, changes] = [text("name", 80), text("team", 60), text("version", 16), text("title", 120), text("changes", 2000)];
    if (!name || (team && !SLUG.test(team)) || !/^v\d+\.\d+(\.\d+)?$/.test(version)) return say({ error: "That version number isn't one the studio can use. They look like v0.8." });
    if (!existsSync(PUSH)) return say({ error: "The /push skill isn't installed on this machine." });

    // Interactive and login, like the terminal, so pnpm and node are on the PATH. The notes are arguments, never shell text.
    const args = ["--dir", folderOf(slug), "--slug", slug, "--name", name, "--version", version, ...(team ? ["--team", team] : []), ...(title ? ["--title", title] : []), ...(changes ? ["--changes", changes] : [])];
    const child = run(process.env.SHELL || "/bin/zsh", ["-ilc", 'exec node "$@"', "push", PUSH, ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    let step = "";
    const tell = (next) => {
      if (next !== step) say({ step: (step = next) });
    };
    // A Next app is built first (the script says so, and its `out/` folder turns up when the build is done); a folder of files goes straight up.
    const folder = folderOf(slug);
    tell(existsSync(join(folder, "package.json")) && !existsSync(join(folder, "index.html")) ? "Preparing" : "Uploading");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (/Installing dependencies/.test(String(chunk))) tell("Installing");
      else if (/Checking the code/.test(String(chunk))) tell("Checking");
      else if (/Building for/.test(String(chunk))) tell("Building");
    });
    child.stderr.on("data", (chunk) => (errors += chunk));
    const later = setInterval(() => step === "Building" && existsSync(join(folder, "out", "index.html")) && tell("Uploading"), 500);
    child.on("close", (code) => {
      clearInterval(later);
      const pushed = /^Pushed (\S+) (v[\d.]+)/m.exec(output);
      // What lint and the type check left (see push.mjs), told after the push; nothing when clean.
      const left = /^Checks: (.+)$/m.exec(output)?.[1];
      if (code === 0 && pushed) return say({ done: { slug: pushed[1], version: pushed[2], ...(left && left !== "clean" ? { checks: left } : {}) } });
      const reason = errors.split("\n").map((line) => line.trim()).filter(Boolean).slice(-3).join(" ");
      say({ error: reason.slice(0, 400) || "The push stopped before it finished." });
    });
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
  // The notes for a push, drafted by Claude: a few seconds to a minute, and abandoned if the dialog goes away.
  if (ours && url.pathname === "/draft" && SLUG.test(slug) && existsSync(folderOf(slug))) {
    const abort = new AbortController();
    response.on("close", () => abort.abort());
    void draftNotes(folderOf(slug), abort.signal).then((notes) => {
      if (!response.writableEnded) response.writeHead(200, { "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" }).end(JSON.stringify(notes));
    });
    return;
  }
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
  if (url.pathname === "/tag") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!SLUG.test(slug)) return refuse();
    return wss.handleUpgrade(request, socket, head, (ws) => {
      const dir = join(ROOT, slug);
      let tagged = "skipped";
      try {
        if (existsSync(join(dir, "next.config.ts"))) tagged = ensureTagging(dir);
      } catch {
        tagged = "skipped";
      }
      ws.send(JSON.stringify({ done: { tagged } }));
      ws.close();
    });
  }
  if (url.pathname === "/forknested") {
    const [slug, id, name] = [url.searchParams.get("slug") ?? "", url.searchParams.get("id") ?? "", url.searchParams.get("name") ?? ""];
    if (!SLUG.test(slug) || !/^[a-z0-9-]+$/.test(id) || !/^[A-Z]\w*$/.test(name)) return refuse();
    return wss.handleUpgrade(request, socket, head, (ws) => void forkNestedFor(ws, { slug, id, name }));
  }
  if (url.pathname === "/extract") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!SLUG.test(slug)) return refuse();
    // What it takes is sent as a message once the connection is open: the props of a component are more than an address holds.
    return wss.handleUpgrade(request, socket, head, (ws) => {
      ws.once("message", (data) => {
        let asked;
        try {
          asked = JSON.parse(String(data));
        } catch {
          return ws.close();
        }
        const loc = typeof asked.loc === "string" ? asked.loc : "";
        const name = typeof asked.name === "string" && /^[\w -]{0,40}$/.test(asked.name) ? asked.name : "";
        const top = asked.top && typeof asked.top.name === "string" && /^[A-Z]\w*$/.test(asked.top.name) ? { name: asked.top.name, props: asked.top.props, usedAt: typeof asked.top.usedAt === "string" ? asked.top.usedAt : undefined } : null;
        const owners = Array.isArray(asked.owners) ? asked.owners.filter((one) => one && typeof one.name === "string").slice(0, 8) : [];
        if (loc && !/^[\w./()[\]@-]+\.tsx:\d+:\d+$/.test(loc)) return ws.close();
        // What the page draws, as JSX: up to what is worth writing to a file.
        const markup = typeof asked.markup === "string" && asked.markup.length > 0 && asked.markup.length < 600_000 ? asked.markup : "";
        void extractElement(ws, { slug, loc, name, exact: asked.exact === true, top, owners, markup });
      });
    });
  }
  if (url.pathname === "/fork") {
    const [slug, id] = [url.searchParams.get("slug") ?? "", url.searchParams.get("id") ?? ""];
    if (!SLUG.test(slug) || !/^[a-z0-9-]+$/.test(id)) return refuse();
    return wss.handleUpgrade(request, socket, head, (ws) => void forkComponent(ws, { slug, id }));
  }
  if (url.pathname === "/push") {
    const slug = url.searchParams.get("slug") ?? "";
    if (!SLUG.test(slug) || !existsSync(folderOf(slug))) return refuse();
    return wss.handleUpgrade(request, socket, head, (ws) => pushPrototype(ws, slug));
  }
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
