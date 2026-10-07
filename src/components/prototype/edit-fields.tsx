"use client";

import { useRef, useState, type ReactNode } from "react";

import { toHex } from "@/lib/edit-dom";

/**
 * The controls edit mode is made of, in the manner of a design tool: a value
 * with a glyph you can drag, a row of icon choices, a swatch with its hex.
 * Everything is controlled by what the page says it is now, so a field never
 * shows a value the prototype doesn't have.
 */

const well = "bg-surface-inset rounded-[var(--r-md)]";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-divider pt-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

/** A glyph, as one of the little pictures a field leads with. */
export function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
      {children}
    </svg>
  );
}

const pixels = (value: string) => (/^-?[\d.]+px$/.test(value) ? String(Math.round(parseFloat(value) * 100) / 100) : value);

/**
 * A number with a glyph in front. Type it, nudge it with the arrow keys (shift
 * for ten), or drag the glyph sideways. `value` is what the page has now, as
 * CSS; `onCommit` is given what to set, as CSS.
 */
export function NumberField({
  glyph,
  label,
  value,
  onCommit,
  unit = "px",
}: {
  glyph: ReactNode;
  label: string;
  value: string;
  onCommit: (css: string) => void;
  unit?: "px" | "opacity";
}) {
  const shown = unit === "opacity" ? String(Math.round(parseFloat(value || "1") * 100)) : pixels(value);
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; from: number } | null>(null);

  const css = (n: number) => (unit === "opacity" ? String(Math.min(100, Math.max(0, n)) / 100) : `${n}px`);
  const commit = (text: string) => {
    const trimmed = text.trim();
    setDraft(null);
    if (!trimmed || trimmed === shown) return;
    if (/^-?[\d.]+$/.test(trimmed)) onCommit(css(parseFloat(trimmed)));
    else if (unit === "px") onCommit(trimmed);
  };
  const current = () => (Number.isNaN(parseFloat(shown)) ? 0 : parseFloat(shown));

  return (
    <label className={`${well} flex h-8 items-center gap-1 pl-2 pr-1 text-sm focus-within:ring-1 focus-within:ring-[var(--focus-ring)]`}>
      <span
        title={`${label} — drag to change`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub.current = { x: event.clientX, from: current() };
        }}
        onPointerMove={(event) => {
          if (!scrub.current) return;
          const step = event.shiftKey ? 10 : 1;
          onCommit(css(Math.round(scrub.current.from + ((event.clientX - scrub.current.x) / 2) * step)));
        }}
        onPointerUp={() => {
          scrub.current = null;
        }}
        className="flex w-5 shrink-0 cursor-ew-resize touch-none items-center justify-center text-foreground-subtle"
      >
        {glyph}
      </span>
      <input
        type="text"
        aria-label={label}
        value={draft ?? shown}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            onCommit(css(current() + (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1)));
            setDraft(null);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none"
      />
    </label>
  );
}

/** A row of icon choices, one of which is on. */
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; title: string; icon: ReactNode }[];
  onChange: (value: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`${well} flex gap-0.5 p-0.5`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`grid h-7 flex-1 place-items-center rounded-[var(--r-md)] ${
            value === option.value ? "bg-surface text-foreground" : "text-foreground-subtle hover:text-foreground"
          }`}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
}

const transparent = (color: string) => color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

/** A colour: its swatch, which opens the picker, and its hex, which can be typed. */
export function ColorField({ label, value, onCommit }: { label: string; value: string; onCommit: (css: string) => void }) {
  const none = transparent(value);
  const hex = none ? "" : toHex(value);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    const typed = text.trim().replace(/^#?/, "#");
    setDraft(null);
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(typed) && typed.toLowerCase() !== hex) onCommit(typed);
  };

  return (
    <label className={`${well} flex h-8 items-center gap-2 pl-2 pr-1 text-sm focus-within:ring-1 focus-within:ring-[var(--focus-ring)]`}>
      <span
        // The swatch shows the colour the page really has, so it is set from the page's own value.
        style={none ? undefined : { backgroundColor: value }}
        className={`relative size-4 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-border ${none ? "bg-surface" : ""}`}
      >
        {none ? <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-foreground-subtle" /> : null}
        <input
          type="color"
          aria-label={`${label} picker`}
          value={hex || "#ffffff"}
          onChange={(event) => onCommit(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <input
        type="text"
        aria-label={label}
        value={draft ?? (none ? "None" : hex.toUpperCase().replace("#", ""))}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => draft !== null && commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none"
      />
    </label>
  );
}
