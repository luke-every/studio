"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";

import { CloseIcon, TerminalIcon } from "@/components/shell/nav-icons";

import { Button } from "@/components/ui/button";
import { begun, TERMINAL_HOST } from "@/lib/terminal";

/** What a token holds on the page right now, so the terminal is painted from the token layer. */
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Narrower than this and the panel is still opening (or has closed), not a place for a screen. */
const MIN_WIDTH = 160;

type State = "starting" | "running" | "closed";

/**
 * Claude Code in the prototype's own folder. The shell lives in the terminal server (`scripts/terminal-server.mjs`), one
 * per prototype, so closing the panel, reloading or opening another prototype leaves it running; this draws it and
 * types into it. Nothing starts until it is asked to (the Start button), so a panel opened to look doesn't leave a
 * terminal running. xterm is loaded when it starts.
 */
export function TerminalPanel({
  slug,
  onStop,
  select,
}: {
  slug: string;
  onStop: () => void;
  /** Choosing an element in the prototype for Claude: whether that is on (`picking`), what is chosen (`chip`), and how to change either. Null where it can't be done (the canvas, a mode of its own). `onWorking` hears whether Claude is working. */
  select: { picking: boolean; onPicking: (on: boolean) => void; chip: string | null; onClear: () => void; onWorking: (working: boolean) => void } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(() => begun.has(slug));
  const [state, setState] = useState<State>("starting");
  const [attempt, setAttempt] = useState(0);
  // Starting the helper, when it isn't running: the studio does it (see /api/terminal) and the panel connects once it answers.
  const [helper, setHelper] = useState<"idle" | "starting" | "failed">("idle");
  // Read when it happens, so the connection isn't remade for a change in what it calls.
  const choosing = useRef(select);
  useEffect(() => {
    choosing.current = select;
  });

  const startHelper = async () => {
    setHelper("starting");
    await fetch("/api/terminal", { method: "POST" }).catch(() => {});
    for (let tries = 0; tries < 25; tries++) {
      const up = await fetch(`http://${TERMINAL_HOST}/?slug=${slug}`).then(() => true, () => false);
      if (up) {
        setHelper("idle");
        setState("starting");
        setAttempt((now) => now + 1);
        return;
      }
      await new Promise((done) => window.setTimeout(done, 400));
    }
    setHelper("failed");
  };

  useEffect(() => {
    const node = host.current;
    if (!node || !started) return undefined;
    let ended = false;
    let socket: WebSocket | undefined;
    let cleanup = () => {};

    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(([{ Terminal }, { FitAddon }]) => {
      if (ended) return;
      const term = new Terminal({
        fontFamily: token("--font-terminal"),
        fontSize: Number(token("--terminal-font-size")) || 12,
        cursorBlink: true,
        allowProposedApi: true,
        theme: {
          background: token("--terminal-background"),
          foreground: token("--terminal-foreground"),
          cursor: token("--terminal-foreground"),
          selectionBackground: token("--terminal-muted"),
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(node);

      // The panel opens by growing from nothing, and closes the same way: the shell is only told a size once there is room
      // for a screen, and a run of sizes while it moves counts as one.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        const ws = new WebSocket(`ws://${TERMINAL_HOST}/?slug=${slug}&cols=${term.cols}&rows=${term.rows}`);
        socket = ws;
        ws.onmessage = (event) => {
          const text = String(event.data);
          // Not the shell's words but the helper's: whether Claude is working.
          if (text.startsWith("\0")) {
            try {
              const said = JSON.parse(text.slice(1)) as { working?: unknown };
              if (typeof said.working === "boolean") choosing.current?.onWorking(said.working);
              return;
            } catch {
              // Not one of those after all: it is shown.
            }
          }
          setState("running");
          term.write(text);
        };
        ws.onclose = () => {
          if (!ended) setState("closed");
        };
        ws.onopen = () => term.focus();
      };
      const settle = () => {
        if (node.offsetWidth < MIN_WIDTH) return;
        fit.fit();
        if (!socket) connect();
        else if (socket.readyState === WebSocket.OPEN) socket.send(`\0${JSON.stringify({ cols: term.cols, rows: term.rows })}`);
      };
      const watch = new ResizeObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(settle, 120);
      });
      watch.observe(node);
      settle();

      // Going to type to Claude ends choosing: a click in the prototype is then a click, and what was chosen stays.
      const typing = () => choosing.current?.onPicking(false);
      term.textarea?.addEventListener("focus", typing);
      const typed = term.onData((data) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(data);
      });
      cleanup = () => {
        term.textarea?.removeEventListener("focus", typing);
        clearTimeout(timer);
        watch.disconnect();
        typed.dispose();
        term.dispose();
      };
    });

    return () => {
      ended = true;
      cleanup();
      socket?.close();
    };
  }, [slug, attempt, started]);

  return (
    <div className="relative flex h-full min-h-64 flex-col bg-[var(--terminal-background)]">
      <div className="flex shrink-0 items-center justify-between px-3 pt-3">
        {select ? (
          <div role="group" aria-label="Pointer" className="flex h-8 items-center rounded-[var(--r-full)] border border-[var(--terminal-muted)] p-0.5">
            {([false, true] as const).map((on) => (
              <button
                key={String(on)}
                type="button"
                aria-pressed={select.picking === on}
                onClick={() => select.onPicking(on)}
                className={`h-6 rounded-[var(--r-full)] px-3 text-ui transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${
                  select.picking === on ? "bg-[var(--terminal-foreground)] text-[var(--terminal-background)]" : "text-[var(--terminal-muted)] hover:text-[var(--terminal-foreground)]"
                }`}
              >
                {on ? "Select" : "Interact"}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Button onClick={onStop}>Stop</Button>
      </div>
      {select?.chip ? (
        <div className="flex shrink-0 px-3 pt-2">
          <span className="inline-flex h-6 max-w-full items-center gap-1 rounded-[var(--r-full)] border border-[var(--terminal-muted)] pl-2.5 pr-1 text-ui text-[var(--terminal-foreground)]">
            <span className="truncate">{select.chip}</span>
            <button type="button" aria-label="Clear the selection" onClick={select.onClear} className="grid size-4 shrink-0 place-items-center rounded-[var(--r-full)] text-[var(--terminal-muted)] hover:text-[var(--terminal-foreground)]">
              <CloseIcon className="size-3" />
            </button>
          </span>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 p-3">
        <div ref={host} className="h-full w-full" />
        {!started ? (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4">
              <TerminalIcon className="size-8 text-[var(--terminal-muted)]" />
              <p className="text-base font-medium text-[var(--terminal-foreground)]">Claude Code</p>
              <Button
                variant="primary"
                onClick={() => {
                  begun.add(slug);
                  setStarted(true);
                }}
              >
                Start
              </Button>
            </div>
          </div>
        ) : null}
        {started && state === "starting" ? <p className="pointer-events-none absolute left-4 top-3 text-ui text-[var(--terminal-muted)] pulse-soft">Starting Claude</p> : null}
      </div>
      {state === "closed" ? (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-border bg-[var(--terminal-background)] p-3">
          <p className={`text-ui text-[var(--terminal-muted)] ${helper === "starting" ? "pulse-soft" : ""}`}>
            {helper === "starting" ? "Starting the terminal" : helper === "failed" ? "It didn't start. In the studio's folder, run npm run terminal." : "The terminal isn't running."}
          </p>
          <Button loading={helper === "starting"} onClick={() => void startHelper()}>
            {helper === "failed" ? "Try again" : "Start it"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
