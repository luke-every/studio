"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import type { CanvasFrame } from "@/lib/canvas-saved";

type Handlers = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
};

/** What a note says before it has any words, shown while it is being typed. */
const HINT = "Jot down your best ideas here...";

/**
 * One sticky note, drawn at the size it is on screen (not inside the canvas's scaled world, where it would be a stretched picture), so its words stay sharp
 * at every zoom. Its text size is a fixed share of its base size (`base`: the side of the square it is, and the least its height can be), so scaling the note
 * scales the words with it. Its height is whatever its words need, never less than the base; its width is the base, or a wider fifth-and-a-quarter of it.
 * The height is measured here, on a copy of the words with the same size and width, and handed to `onFit`.
 */
export function StickyNote({
  note,
  scale,
  corner,
  background,
  outline,
  transition,
  locked,
  editing,
  handlers,
  onEdit,
  onCommit,
  onFit,
}: {
  note: CanvasFrame;
  /** Screen pixels to a unit of the canvas. */
  scale: number;
  /** Where its top left is, in the canvas's window. */
  corner: { x: number; y: number };
  background: string;
  outline?: string;
  transition?: string;
  locked: boolean;
  editing: boolean;
  handlers: Handlers;
  onEdit: () => void;
  onCommit: (text: string) => void;
  /** Its height, in canvas units, once its words are measured. */
  onFit: (height: number) => void;
}) {
  const base = note.base ?? Math.min(note.width, note.height);
  const unit = base * scale;
  const [w, h] = [note.width * scale, note.height * scale];
  const font = Math.max(5, unit / 12);
  const pad = unit / 10;
  // The room under the words for the name of whoever wrote it.
  const nameRoom = note.author ? unit / 12 + unit / 18 : 0;
  // What is typed, while it is being typed (the note's own words are only kept when it is let go of), so the height follows each key.
  const [draft, setDraft] = useState<string | null>(null);
  const words = draft ?? note.text ?? "";
  const measure = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const room = measure.current?.getBoundingClientRect().height;
    if (!room) return;
    const wanted = Math.max(base, room / scale);
    // Only a real change: the measure moves a little with the zoom, and the saved canvas should not.
    if (Math.abs(wanted - note.height) > 1) onFit(wanted);
  });

  const type: CSSProperties = { fontSize: font, color: "#2b2724" };
  return (
    <div
      {...handlers}
      // On the note itself, not its words: the press captures the pointer, so a double-click is only heard here.
      onDoubleClick={() => !locked && onEdit()}
      style={{ left: corner.x, top: corner.y, width: w, height: h, background, borderRadius: (note.radius ?? 4) * scale, boxShadow: "var(--elev-floating)", pointerEvents: locked ? "none" : "auto", outline, transition }}
      className="absolute cursor-default"
    >
      {/* The words laid out where nobody sees them, to find how tall they make the note. */}
      <span
        ref={measure}
        aria-hidden
        style={{ ...type, width: w, padding: `${pad}px ${pad}px ${pad + nameRoom}px` }}
        className="invisible absolute left-0 top-0 whitespace-pre-wrap break-words font-sans font-medium leading-snug"
      >
        {words || " "}
        {words.endsWith("\n") ? " " : ""}
      </span>
      {editing ? (
        <textarea
          autoFocus
          defaultValue={note.text ?? ""}
          aria-label="Sticky note"
          placeholder={HINT}
          // All its words are selected as it opens, so typing replaces them (a new, empty note has none).
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") event.currentTarget.blur();
          }}
          onBlur={(event) => {
            setDraft(null);
            onCommit(event.currentTarget.value);
          }}
          style={{ ...type, padding: `${pad}px ${pad}px ${pad + nameRoom}px` }}
          className="absolute inset-0 size-full resize-none bg-transparent text-left font-sans font-medium leading-snug outline-none placeholder:text-[rgba(43,39,36,0.45)]"
        />
      ) : (
        <span style={{ ...type, padding: `${pad}px ${pad}px ${pad + nameRoom}px` }} className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-left font-sans font-medium leading-snug">
          {note.text}
        </span>
      )}
      {note.author ? (
        <span aria-hidden style={{ left: pad, bottom: unit / 12, fontSize: Math.max(5, unit / 18), color: "rgba(43,39,36,0.6)", maxWidth: w * 0.8 }} className="pointer-events-none absolute truncate font-sans font-medium">
          {note.author}
        </span>
      ) : null}
    </div>
  );
}
