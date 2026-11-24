import "server-only";

import { execFile, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { listItems, startItem, stopItem } from "@/lib/registry/design-qa";
import { devServers, endTerminal, QA_PREFIX, restartDevServer, startDevServer, stopDevServer } from "@/lib/registry/local-prototypes";

const run = promisify(execFile);

const STORYBOOK_PORT = 6006;
const TERMINAL_PORT = 4748;
const STUDIO_PORT = 4747;
const STUDIO_LABEL = "com.luke.prototype-studio";
const WEBSITE = join(homedir(), "Claude", "every-website-main");
/** The stories and Storybook's settings live with the team's conventions, not in the website's repo: sync.mjs copies the stories and their settings (as .storybook-studio) into WEBSITE while it runs. */
const STORYBOOK_DIR = join(homedir(), "Claude", "team-conventions", "storybook");

export type Service = { id: string; name: string; port: number | null; running: boolean; actions: ("start" | "stop" | "restart")[] };
export type Action = "start" | "stop" | "restart";
export type Result = { ok: true } | { ok: false; error: string };

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The process listening on a port, or null. */
async function listener(port: number) {
  const { stdout } = await run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]).catch(() => ({ stdout: "" }));
  const pid = Number(stdout.split("\n")[0]);
  return pid || null;
}

/** Waits (up to `seconds`) for a port to be taken, or to be free. */
async function waitForPort(port: number, taken: boolean, seconds: number) {
  for (let tries = 0; tries < seconds * 2; tries++) {
    if (Boolean(await listener(port)) === taken) return true;
    await pause(500);
  }
  return false;
}

/** What a service started from here is given: not the studio's own `PORT` (it would try to take it), nor Next's private settings. */
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "PORT" && key !== "NODE_ENV" && !key.startsWith("__NEXT") && !key.startsWith("NEXT_"))) as NodeJS.ProcessEnv;

/** Stops Storybook with the studio: it runs in its own process group, so the whole tree goes. */
function stopWithStudio(child: ChildProcess) {
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid);
    } catch {}
  };
  process.once("exit", stop);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      stop();
      process.kill(process.pid, signal);
    });
  }
}

/** Starts Storybook for the website. It lives as long as the studio does. */
export async function startStorybook() {
  if (await listener(STORYBOOK_PORT)) return;
  try {
    execFileSync("node", [join(STORYBOOK_DIR, "sync.mjs"), "--add"], { stdio: "ignore" });
  } catch {
    // Without the stories Storybook still starts, with the website's own.
  }
  const child = spawn(join(WEBSITE, "node_modules", ".bin", "storybook"), ["dev", "-c", ".storybook-studio", "-p", String(STORYBOOK_PORT), "--no-open"], { cwd: WEBSITE, detached: true, stdio: "ignore" });
  child.on("error", () => {});
  stopWithStudio(child);
}

async function stopStorybook() {
  const pid = await listener(STORYBOOK_PORT);
  if (!pid) return;
  // The listener is a child of the process group Storybook was started as; ending the group ends the lot.
  const { stdout } = await run("ps", ["-o", "pgid=", "-p", String(pid)]).catch(() => ({ stdout: "" }));
  const group = Number(stdout.trim());
  try {
    process.kill(group > 1 && group !== process.pid ? -group : pid, "SIGTERM");
  } catch {}
}

function startTerminal() {
  const log = openSync(join(homedir(), "Library", "Logs", "prototype-studio-terminal.log"), "a");
  const child = spawn(process.execPath, ["scripts/terminal-server.mjs"], { cwd: process.cwd(), detached: true, stdio: ["ignore", log, log], env: cleanEnv() });
  child.on("error", () => {});
  child.unref();
}

async function stopTerminal() {
  const pid = await listener(TERMINAL_PORT);
  if (pid) process.kill(pid, "SIGTERM");
}

/** Whether launchd runs the studio, which is what can bring it back after it has stopped itself. */
async function launchdHasStudio() {
  return run("launchctl", ["print", `gui/${process.getuid?.()}/${STUDIO_LABEL}`]).then(() => true, () => false);
}

/** The prototypes the terminal helper has a Claude running for. Empty when the helper isn't up. */
async function claudeSessions() {
  const response = await fetch(`http://127.0.0.1:${TERMINAL_PORT}/sessions`, { headers: { Origin: `http://localhost:${STUDIO_PORT}` }, signal: AbortSignal.timeout(2000) }).catch(() => null);
  return response?.ok ? ((await response.json()) as string[]) : [];
}

/** Every service on this machine: the studio, its helper, Storybook, a dev server for each prototype that has one running, each design QA, and each Claude session. */
export async function listServices(): Promise<Service[]> {
  const [studio, terminal, storybook, prototypes, qa, sessions] = await Promise.all([listener(STUDIO_PORT), listener(TERMINAL_PORT), listener(STORYBOOK_PORT), devServers(), listItems().catch(() => []), claudeSessions()]);
  const fixed: Service[] = [
    { id: "studio", name: "Studio", port: STUDIO_PORT, running: Boolean(studio), actions: ["restart"] },
    { id: "terminal", name: "Terminal", port: TERMINAL_PORT, running: Boolean(terminal), actions: terminal ? ["stop", "restart"] : ["start"] },
    { id: "storybook", name: "Storybook", port: STORYBOOK_PORT, running: Boolean(storybook), actions: storybook ? ["stop", "restart"] : ["start"] },
  ];
  const dev = [...prototypes].filter(([slug]) => !slug.startsWith(QA_PREFIX)).sort(([a], [b]) => a.localeCompare(b)).map(([slug, port]): Service => ({ id: `prototype:${slug}`, name: slug, port, running: true, actions: ["stop", "restart"] }));
  // A design QA that is still being set up, or failed, has its own place; one put away isn't running anything.
  const checks = qa
    .filter((item) => !item.archived && (item.state === "running" || item.state === "stopped"))
    .map((item): Service => ({ id: `qa:${item.id}`, name: `Design QA, ${item.branch}`, port: item.port, running: item.state === "running", actions: item.state === "running" ? ["stop", "restart"] : ["start"] }));
  const claude = sessions.sort().map((slug): Service => ({ id: `claude:${slug}`, name: `Claude, ${slug.startsWith(QA_PREFIX) ? `QA ${slug.slice(QA_PREFIX.length)}` : slug}`, port: null, running: true, actions: ["stop"] }));
  return [...fixed, ...dev, ...checks, ...claude];
}

/** Does one thing to one service. Where it can take a few seconds, it answers when it is done. */
export async function control(id: string, action: Action): Promise<Result> {
  if (id.startsWith("prototype:")) {
    const slug = id.slice("prototype:".length);
    if (!/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "That isn't a service." };
    if (action === "stop") return (await stopDevServer(slug)), { ok: true };
    return action === "restart" ? restartDevServer(slug) : startDevServer(slug);
  }

  if (id.startsWith("qa:")) {
    const qa = id.slice(3);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(qa) || qa.includes("..")) return { ok: false, error: "That isn't a service." };
    const port = (await listItems().catch(() => [])).find((item) => item.id === qa)?.port;
    if (!port) return { ok: false, error: "That design QA is gone." };
    if (action !== "start") {
      await stopItem(qa);
      if (!(await waitForPort(port, false, 10))) return { ok: false, error: "It didn't stop." };
    }
    if (action !== "stop") {
      await startItem(qa);
      if (!(await waitForPort(port, true, 60))) return { ok: false, error: "It didn't come up in time." };
    }
    return { ok: true };
  }

  if (id.startsWith("claude:")) {
    const slug = id.slice(7);
    if (action !== "stop" || !/^[a-z0-9-]+$/.test(slug)) return { ok: false, error: "A Claude session is started by opening the terminal on its prototype." };
    await endTerminal(slug);
    return { ok: true };
  }

  if (id === "studio") {
    if (action !== "restart") return { ok: false, error: "The studio can only be restarted from here." };
    if (!(await launchdHasStudio())) return { ok: false, error: "The studio wasn't started by the login item, so it can't be restarted from here. Stop it in its terminal and run npm run dev." };
    // This process is what is being restarted: launchd does it, and the page waits for the studio to come back.
    const child = spawn("launchctl", ["kickstart", "-k", `gui/${process.getuid?.()}/${STUDIO_LABEL}`], { detached: true, stdio: "ignore" });
    child.on("error", () => {});
    child.unref();
    return { ok: true };
  }

  const one = id === "terminal" ? { port: TERMINAL_PORT, start: async () => startTerminal(), stop: stopTerminal } : id === "storybook" ? { port: STORYBOOK_PORT, start: startStorybook, stop: stopStorybook } : null;
  if (!one) return { ok: false, error: "That isn't a service." };

  if (action !== "start") {
    await one.stop();
    if (!(await waitForPort(one.port, false, 10))) return { ok: false, error: "It didn't stop." };
  }
  if (action !== "stop") {
    await one.start();
    if (!(await waitForPort(one.port, true, id === "storybook" ? 60 : 10))) return { ok: false, error: "It didn't come up in time." };
  }
  return { ok: true };
}
