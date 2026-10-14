"use client";

import { useRef, useState } from "react";

/** How far the column has to be dragged left before letting go hides it. */
const HIDE_DRAG = 80;

/**
 * The grip between the content column and the prototype. Drag it left and the
 * column follows; let go past a short distance and it slides off for good.
 * Arrow left does the same from the keyboard. Wide screens only, where the
 * column sits beside the prototype.
 */
export function ColumnHandle({ offset, onDrag, onHide }: { offset: number; onDrag: (offset: number) => void; onHide: () => void }) {
  const [dragging, setDragging] = useState(false);
  const start = useRef(0);

  const move = (x: number) => onDrag(Math.min(0, x - start.current));
  const release = (x: number) => {
    setDragging(false);
    if (x - start.current <= -HIDE_DRAG) onHide();
    onDrag(0);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag left to hide the details. Left arrow hides them too."
      tabIndex={0}
      data-dragging={dragging || undefined}
      onPointerDown={(event) => {
        start.current = event.clientX;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => dragging && move(event.clientX)}
      onPointerUp={(event) => dragging && release(event.clientX)}
      onPointerCancel={() => {
        setDragging(false);
        onDrag(0);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onHide();
        }
      }}
      // Sits in the gap between the column and the prototype: the page's side margin, then the column's width, and follows the column's edge as it is pulled.
      style={{ left: `max(2rem, calc(2rem + var(--detail-side-width) + ${offset}px))` }}
      className="group/handle absolute bottom-6 top-2 z-[var(--z-raised)] hidden w-4 cursor-ew-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <span className="h-12 w-1 rounded-[var(--r-full)] bg-foreground-muted opacity-0 transition-opacity duration-[var(--dur-standard)] ease-[var(--curve-standard)] group-hover/handle:opacity-100 group-focus-visible/handle:opacity-100 group-data-[dragging]/handle:opacity-100" />
    </div>
  );
}

/**
 * What is left of a hidden column: a sliver at the far left edge. Hover it and
 * it slides out and says what it is; tap and the column comes back.
 */
export function RevealTab({ onShow }: { onShow: () => void }) {
  return (
    <button
      type="button"
      onClick={onShow}
      aria-label="Show the details"
      style={{ zIndex: "var(--z-focus-mode)" }}
      className="group/reveal fixed inset-y-0 left-0 hidden w-10 items-center outline-none lg:flex"
    >
      <span className="flex -translate-x-[calc(100%-0.375rem)] items-center rounded-r-[var(--r-control)] border border-l-0 border-border bg-surface-elevated py-10 pl-3 pr-4 text-ui font-medium text-foreground opacity-70 shadow-[var(--elev-floating)] transition-[translate,opacity] duration-[var(--dur-standard)] ease-[var(--curve-standard)] group-hover/reveal:translate-x-0 group-hover/reveal:opacity-100 group-focus-visible/reveal:translate-x-0 group-focus-visible/reveal:opacity-100">
        Show details
      </span>
    </button>
  );
}
