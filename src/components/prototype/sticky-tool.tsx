"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

import { controlOn, IconButton } from "@/components/ui/button";
import { STICKY_COLORS } from "@/lib/canvas-saved";

/** How far a press has to move before it is a drag (a note being carried) and not a click. */
const DRAG_PX = 5;

/**
 * The sticky note in the canvas's bar, as FigJam has it. A click takes it up (a click on the canvas then puts one down, in the colour it holds); pressing
 * and dragging carries a new note out onto the canvas and puts it down where it is let go. Pointing at it opens the colours above it: a click on one takes
 * the note up in that colour, and one can be dragged out too. The button is a small note in the colour in hand.
 *
 * The colours are shown by the CSS alone (pointing at the button, or focus inside), with no delay to cross: a bridge of padding joins the two. They open and close as the studio's dropdowns do.
 */
export function StickyTool({
  active,
  color,
  size,
  onActivate,
  onColor,
  onDrop,
}: {
  active: boolean;
  color: string;
  /** How big a note is on screen now, in pixels: what is carried is drawn at that size. */
  size: number;
  onActivate: () => void;
  onColor: (color: string) => void;
  /** A note let go of at a point in the window: put it down there, if that is on the canvas. */
  onDrop: (color: string, x: number, y: number) => void;
}) {
  const [carried, setCarried] = useState<{ color: string; x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; color: string; carrying: boolean } | null>(null);
  // A drag ends in a click on what it started on, which isn't one.
  const dragged = useRef(false);

  const down = (event: React.PointerEvent<HTMLElement>, chosen: string) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, color: chosen, carrying: false };
  };
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const now = press.current;
    if (!now) return;
    if (!now.carrying && Math.hypot(event.clientX - now.x, event.clientY - now.y) < DRAG_PX) return;
    now.carrying = true;
    setCarried({ color: now.color, x: event.clientX, y: event.clientY });
  };
  const up = (event: React.PointerEvent<HTMLElement>) => {
    const now = press.current;
    press.current = null;
    if (!now?.carrying) return;
    dragged.current = true;
    window.setTimeout(() => (dragged.current = false), 0);
    setCarried(null);
    onDrop(now.color, event.clientX, event.clientY);
  };
  const cancel = () => {
    press.current = null;
    setCarried(null);
  };

  return (
    <div className="group/sticky relative flex items-center">
      <IconButton
        tooltipSide="above"
        label="Sticky note (S)"
        variant="ghost"
        aria-pressed={active}
        aria-haspopup="menu"
        className={`${active ? controlOn : ""} touch-none`}
        onPointerDown={(event) => down(event, color)}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onClick={() => !dragged.current && onActivate()}
      >
        <span aria-hidden style={{ background: color }} className="block size-[1.125rem] rounded-[var(--r-xs)] border border-border shadow-[var(--elev-overlay)]" />
      </IconButton>

      {/* Opens as a dropdown does: it grows up out of the button (small and clear first, from its bottom middle) and goes back into it, on the same timing as the studio's menus. */}
      <div
        className="invisible absolute bottom-full left-1/2 origin-bottom -translate-x-1/2 scale-90 pb-3 opacity-0 transition-[opacity,scale,visibility] duration-[var(--dur-standard)] ease-[var(--curve-standard)] group-focus-within/sticky:visible group-focus-within/sticky:scale-100 group-focus-within/sticky:opacity-100 group-hover/sticky:visible group-hover/sticky:scale-100 group-hover/sticky:opacity-100 motion-reduce:scale-100 motion-reduce:transition-opacity"
        style={{ zIndex: "var(--z-popover)" }}
      >
        <div role="menu" aria-label="Sticky note colours" className="flex gap-1.5 rounded-[var(--r-tile)] border border-border bg-surface-elevated p-2 shadow-floating">
          {STICKY_COLORS.map((one) => (
            <button
              key={one.id}
              type="button"
              role="menuitemradio"
              aria-checked={one.color === color}
              aria-label={one.name}
              title={one.name}
              onPointerDown={(event) => down(event, one.color)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onClick={() => !dragged.current && onColor(one.color)}
              style={{ background: one.color }}
              className={`size-6 shrink-0 touch-none rounded-[var(--r-sm)] border border-border transition-transform duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:scale-110 ${one.color === color ? "ring-2 ring-[var(--selection)] ring-offset-1 ring-offset-surface-elevated" : ""}`}
            />
          ))}
        </div>
      </div>

      {carried
        ? createPortal(
            <span
              aria-hidden
              style={{ left: carried.x - size / 2, top: carried.y - size / 2, width: size, height: size, background: carried.color, zIndex: "var(--z-popover)" }}
              className="pointer-events-none fixed rounded-[var(--r-xs)] shadow-[var(--elev-floating)]"
            />,
            document.body,
          )
        : null}
    </div>
  );
}
