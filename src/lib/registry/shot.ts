import "server-only";

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Step } from "@/lib/state-replay";

/**
 * A picture of the running prototype, for an engineer's agent to match its own work against (the screenshot Figma hands over with each node): the page, or one element of
 * it found by where its markup is written (`data-studio-loc`), at a width, optionally after a kept state's steps are played. Made by a headless Chrome on this machine,
 * driven over its debugging socket: the page is the real one, in the real browser, so what is photographed is what runs. Only on a machine with a Chrome and the
 * prototype running; one picture at a time.
 */
const CHROMES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"];
export const chromeHere = () => CHROMES.find(existsSync) ?? null;

const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** Plays steps in the page, as `replaySteps` does in the studio's own frames: the whole press, waiting for the element and for the page to settle after. */
const REPLAY = `(async (steps) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const settle = (quiet = 350, most = 3000) => new Promise((done) => {
    let changed = false, over = false, t;
    const finish = () => { if (over) return; over = true; o.disconnect(); done(changed); };
    const o = new MutationObserver(() => { changed = true; clearTimeout(t); t = setTimeout(finish, quiet); });
    t = setTimeout(finish, quiet); setTimeout(finish, most);
    o.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
  const press = (el) => {
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    const P = (type, buttons) => new PointerEvent(type, { ...init, buttons, pointerId: 1, pointerType: "mouse", isPrimary: true });
    const M = (type, buttons) => new MouseEvent(type, { ...init, buttons });
    el.dispatchEvent(P("pointerdown", 1)); el.dispatchEvent(M("mousedown", 1));
    if (el.focus) el.focus({ preventScroll: true });
    el.dispatchEvent(P("pointerup", 0)); el.dispatchEvent(M("mouseup", 0)); el.dispatchEvent(M("click", 0));
  };
  await settle(600, 5000);
  for (const step of steps) {
    let el = null;
    for (let i = 0; i < 27 && !el; i++) { try { el = document.querySelector(step.click); } catch { return false; } if (!el) await wait(150); }
    if (!el) return false;
    for (let k = 0; k < 3; k++) {
      const now = document.querySelector(step.click);
      if (!now) break;
      const watching = settle();
      press(now);
      if (await watching) break;
      await wait(600);
    }
  }
  return true;
})`;

type Message = { id?: number; result?: unknown; error?: { message: string }; method?: string; sessionId?: string; params?: Record<string, unknown> };

/** A Chrome, started on a socket of its own with a profile of its own that is thrown away after. */
async function launch(chrome: string) {
  const profile = await mkdtemp(join(tmpdir(), "studio-shot-"));
  const child: ChildProcess = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-gpu", "--mute-audio", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const address = await new Promise<string>((resolve, reject) => {
    let seen = "";
    const timer = setTimeout(() => reject(new Error("Chrome didn't start.")), 15_000);
    child.stderr?.on("data", (chunk) => {
      seen += String(chunk);
      const found = /DevTools listening on (ws:\/\/\S+)/.exec(seen);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    });
    child.on("exit", () => reject(new Error("Chrome stopped.")));
  });
  const done = async () => {
    child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { address, done };
}

/** The little of the debugging protocol a picture needs. */
function protocol(socket: WebSocket) {
  let next = 0;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const heard: ((message: Message) => void)[] = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as Message;
    const asked = message.id !== undefined ? waiting.get(message.id) : undefined;
    if (asked && message.id !== undefined) {
      waiting.delete(message.id);
      if (message.error) asked.reject(new Error(message.error.message));
      else asked.resolve(message.result);
    } else for (const listen of heard) listen(message);
  });
  const send = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<T>((resolve, reject) => {
      const id = ++next;
      waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  return { send, listen: (fn: (message: Message) => void) => void heard.push(fn) };
}

export type Shot = { url: string; width: number; /** What to photograph: an element, by its `data-studio-loc`. The whole page when absent. */ loc?: string; /** Played before the picture is taken. */ steps?: Step[] };

let queue: Promise<unknown> = Promise.resolve();

/** One picture at a time: a Chrome each is plenty on a laptop that is also running the prototype. */
export function takeShot(shot: Shot): Promise<Buffer> {
  const run = queue.then(() => photograph(shot));
  queue = run.catch(() => {});
  return run;
}

async function photograph({ url, width, loc, steps }: Shot): Promise<Buffer> {
  const chrome = chromeHere();
  if (!chrome) throw new Error("No Chrome on this machine to take the picture with.");
  const browser = await launch(chrome);
  try {
    const socket = new WebSocket(browser.address);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("Couldn't reach Chrome.")));
    });
    const { send, listen } = protocol(socket);
    const { targetId } = await send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
    const to = <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}) => send<T>(method, params, sessionId);

    await to("Page.enable");
    // A phone-sized width is a phone to the page: touch, and the mobile viewport.
    await to("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: width < 700 });
    const loaded = new Promise<void>((resolve) => {
      listen((message) => {
        if (message.sessionId === sessionId && message.method === "Page.loadEventFired") resolve();
      });
      setTimeout(resolve, 30_000);
    });
    await to("Page.navigate", { url });
    await loaded;

    const evaluate = async <T>(expression: string) => ((await to<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value ?? null) as T | null;
    if (steps?.length) await evaluate(`${REPLAY}(${JSON.stringify(steps)})`);
    else await evaluate(`new Promise((done) => { let t = setTimeout(done, 900); const o = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { o.disconnect(); done(); }, 600); }); o.observe(document, { subtree: true, childList: true, attributes: true }); setTimeout(() => { o.disconnect(); done(); }, 5000); })`);
    await pause(300);

    let clip: { x: number; y: number; width: number; height: number; scale: number };
    if (loc) {
      const box = await evaluate<{ x: number; y: number; width: number; height: number } | null>(
        `(() => { const el = document.querySelector('[data-studio-loc="${loc}"]'); if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } : null; })()`,
      );
      if (!box) throw new Error("That element isn't drawn on the page at this width.");
      clip = { ...box, scale: 1 };
    } else {
      const size = await evaluate<{ width: number; height: number }>(`({ width: document.documentElement.clientWidth, height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) })`);
      clip = { x: 0, y: 0, width: size?.width ?? width, height: Math.min(size?.height ?? 900, 16_000), scale: 1 };
    }
    const { data } = await to<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip });
    socket.close();
    return Buffer.from(data, "base64");
  } finally {
    await browser.done();
  }
}
