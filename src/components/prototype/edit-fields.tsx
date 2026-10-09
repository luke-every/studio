"use client";

import { useRef, useState, type ReactNode } from "react";

import { CheckIcon } from "@/components/shell/nav-icons";
import { toHex } from "@/lib/edit-dom";

/**
 * The controls edit mode is made of, in the manner of Figma's design panel:
 * sections divided by hairlines, a small caption above each control, a value
 * with a glyph you can drag, a joined row of icon choices with the chosen one
 * dark, a swatch with its hex.
 * Everything is controlled by what the page says it is now, so a field never
 * shows a value the prototype doesn't have.
 */

const well = "bg-surface-inset rounded-[var(--r-md)]";

/** A titled group, full width with a hairline under it. `action` sits at the end of the title row. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col border-b border-divider pb-3">
      <div className="flex h-10 items-center justify-between gap-2 px-4">
        <h3 className="text-xs font-medium text-foreground">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-3 px-4">{children}</div>
    </section>
  );
}

/** A small caption above a control. */
export function Field({ caption, children }: { caption?: string; children: ReactNode }) {
  if (!caption) return children;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-foreground-muted">{caption}</span>
      {children}
    </div>
  );
}

/** A small square button for the end of a section's title row. */
export function PanelButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 min-w-6 place-items-center rounded-[var(--r-md)] px-1.5 text-xs text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** A tick box with its label. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="grid size-4 place-items-center rounded-[var(--r-sm)] bg-surface-inset text-transparent transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-1 peer-focus-visible:ring-[var(--focus-ring)]">
        <CheckIcon className="size-3" />
      </span>
      {label}
    </label>
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
  caption,
}: {
  glyph: ReactNode;
  label: string;
  value: string;
  onCommit: (css: string) => void;
  unit?: "px" | "opacity" | "number";
  /** Shown above the field. */
  caption?: string;
}) {
  const shown = unit === "opacity" ? String(Math.round(parseFloat(value || "1") * 100)) : unit === "number" ? value : pixels(value);
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; from: number } | null>(null);

  const css = (n: number) => (unit === "opacity" ? String(Math.min(100, Math.max(0, n)) / 100) : unit === "number" ? String(n) : `${n}px`);
  const commit = (text: string) => {
    const trimmed = text.trim();
    setDraft(null);
    if (!trimmed || trimmed === shown) return;
    if (/^-?[\d.]+$/.test(trimmed)) onCommit(css(parseFloat(trimmed)));
    else if (unit === "px" || unit === "number") onCommit(trimmed);
  };
  const current = () => (Number.isNaN(parseFloat(shown)) ? 0 : parseFloat(shown));

  return (
    <Field caption={caption}>
    <label className={`${well} flex h-7 items-center gap-1 pl-1.5 pr-1 text-xs focus-within:ring-1 focus-within:ring-[var(--focus-ring)]`}>
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
    </Field>
  );
}

/** A short list to choose from, for options too many or too wordy for icons. */
export function SelectField({
  caption,
  label,
  value,
  options,
  onChange,
}: {
  caption?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field caption={caption}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${well} h-7 w-full px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[var(--focus-ring)]`}
      >
        {options.some((option) => option.value === value) ? null : (
          <option value={value} hidden>
            {value}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A joined row of icon choices, one of which is on. */
export function Choice({
  label,
  value,
  options,
  onChange,
  caption,
}: {
  label: string;
  value: string;
  options: { value: string; title: string; icon: ReactNode }[];
  onChange: (value: string) => void;
  /** Shown above the row. */
  caption?: string;
}) {
  return (
    <Field caption={caption}>
    <div role="radiogroup" aria-label={label} className="flex gap-px">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`grid h-7 flex-1 place-items-center bg-surface-inset transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] first:rounded-l-[var(--r-md)] last:rounded-r-[var(--r-md)] ${
            value === option.value ? "!bg-accent text-accent-foreground" : "text-foreground-muted hover:text-foreground"
          }`}
        >
          {option.icon}
        </button>
      ))}
    </div>
    </Field>
  );
}

const transparent = (color: string) => color === "transparent" || /rgba\(.*,\s*0\)$/.test(color);

/** A colour: its swatch, which opens the picker, and its hex, which can be typed. */
export function ColorField({ label, value, onCommit, caption }: { label: string; value: string; onCommit: (css: string) => void; caption?: string }) {
  const none = transparent(value);
  const hex = none ? "" : toHex(value);
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (text: string) => {
    const typed = text.trim().replace(/^#?/, "#");
    setDraft(null);
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(typed) && typed.toLowerCase() !== hex) onCommit(typed);
  };

  return (
    <Field caption={caption}>
    <label className={`${well} flex h-7 items-center gap-2 pl-1.5 pr-1 text-xs focus-within:ring-1 focus-within:ring-[var(--focus-ring)]`}>
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
    </Field>
  );
}
