"use client";

import { useRef, useState, type ComponentProps } from "react";

import { TerminalPanel } from "./terminal-panel";

/** The least the terminal is let be, and the least it leaves the prototype or canvas beside it, in px. */
const MIN_WIDTH = 320;
const MIN_STAGE = 320;
/** The gap between the stage and the dock (the frame's `gap-4`). */
const GAP = 16;
/** How far an arrow key moves the grip. */
const STEP = 16;
const KEY = "terminal:width";

/**
 * The terminal as a column on the right of the prototype or the canvas, which narrows to make room for it. The grip in
 * the gap between them (the same one the share page has between its text and the prototype) drags it wider or narrower,
 * or arrow left and right do it from the keyboard; the width is kept for next time, in this browser only. Wide
 * screens only. It stays mounted so it can come and go the way the side panel does.
 */
export function TerminalDock({ slug, open, onStop, square, select }: { slug: string; open: boolean; onStop: () => void; square?: boolean; select: ComponentProps<typeof TerminalPanel>["select"] }) {
  const dock = useRef<HTMLDivElement>(null);
  // The width the person chose, in px; until they do, the token's. (Only ever drawn in the browser, so it can be read at once.)
  const [saved, setSaved] = useState<number | null>(() => {
    try {
      const kept = Number(localStorage.getItem(KEY));
      return kept >= MIN_WIDTH ? kept : null;
    } catch {
      return null;
    }
  });
  // The width while it is being dragged, which the column follows with no easing.
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef({ x: 0, width: 0 });

  const limit = (width: number) => Math.round(Math.max(MIN_WIDTH, Math.min(width, (dock.current?.parentElement?.clientWidth ?? Infinity) - MIN_STAGE - GAP)));
  const keep = (width: number) => {
    setSaved(width);
    try {
      localStorage.setItem(KEY, String(width));
    } catch {}
  };

  const width = drag ?? saved;
  const size = width === null ? "var(--terminal-panel-width)" : `${width}px`;
  const still = drag !== null ? { transition: "none" } : undefined;

  return (
    <div
      ref={dock}
      inert={!open}
      style={{ width: open ? size : 0, ...still }}
      className={`relative hidden shrink-0 transition-[width,margin,visibility] duration-[var(--dur-standard)] ease-[var(--curve-standard)] sm:block ${open ? "" : "invisible -ml-4"}`}
    >
      {open ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the terminal"
          aria-valuenow={width ?? undefined}
          tabIndex={0}
          data-dragging={drag !== null || undefined}
          onPointerDown={(event) => {
            start.current = { x: event.clientX, width: dock.current?.offsetWidth ?? MIN_WIDTH };
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag(start.current.width);
          }}
          onPointerMove={(event) => drag !== null && setDrag(limit(start.current.width - (event.clientX - start.current.x)))}
          onPointerUp={() => {
            if (drag !== null) keep(drag);
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={(event) => {
            const by = event.key === "ArrowLeft" ? STEP : event.key === "ArrowRight" ? -STEP : 0;
            if (!by) return;
            event.preventDefault();
            keep(limit((dock.current?.offsetWidth ?? MIN_WIDTH) + by));
          }}
          className="group/handle absolute -left-4 inset-y-0 z-[var(--z-raised)] flex w-4 cursor-ew-resize touch-none items-center justify-center outline-none"
        >
          <span className="h-12 w-1 rounded-[var(--r-full)] bg-foreground-muted opacity-0 transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[dragging]/handle:opacity-100" />
        </div>
      ) : null}
      {/* It slides in a short way from the right and fades in as the space opens, as the side panel does. Its own width is fixed, so the screen inside isn't squeezed while the column grows. */}
      <div
        style={{ width: size, ...still }}
        className={`absolute inset-y-0 right-0 overflow-hidden rounded-[var(--r-tile)] bg-[var(--terminal-background)] transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] ${square ? "lg:rounded-r-none" : ""} ${
          open ? "" : "translate-x-6 opacity-0 motion-reduce:translate-x-0"
        }`}
      >
        {open ? <TerminalPanel slug={slug} onStop={onStop} select={select} /> : null}
      </div>
    </div>
  );
}
