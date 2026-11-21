"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CheckIcon, ChevronDownIcon, PlusIcon } from "@/components/shell/nav-icons";
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

/**
 * A titled group, full width with a hairline under it. `action` sits at the end of the title row. A section that
 * isn't applied (`applied` false) is only its title and a plus; the plus applies it (`onAdd`) and it opens.
 */
/**
 * The one place a properties panel says what is selected: its name alone (Frame, Text, Image, a component's name), larger than the section headings under it, with nothing
 * to rename here (a layer is renamed in the layers). A component's props sit in this same container, directly under its name: pass them as `children`. `note` is plain
 * context after the name (what a part is inside), never a control.
 */
export function PanelTitle({ name, note, component = false, fork = false, action, children }: { name: string; note?: string; component?: boolean; fork?: boolean; /** At the far end of the title: the one thing to do with what is selected (a component's Edit). */ action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-divider p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
          {component || fork ? <span aria-hidden className={`size-2 shrink-0 rounded-full ${fork ? "bg-[var(--fork)]" : "bg-[var(--component)]"}`} /> : null}
          <span className="min-w-0 truncate">{name}</span>
          {note ? <span className="shrink-0 text-xs font-normal tracking-normal text-foreground-muted">{note}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, action, children, applied = true, onAdd }: { title: string; action?: ReactNode; children?: ReactNode; applied?: boolean; onAdd?: () => void }) {
  if (!applied) {
    return (
      <button
        type="button"
        aria-label={`Add ${title.toLowerCase()}`}
        onClick={onAdd}
        className="flex h-10 w-full items-center justify-between border-b border-divider px-4 text-xs text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:text-foreground"
      >
        {title}
        <PlusIcon className="size-4" />
      </button>
    );
  }
  return (
    <section className="flex flex-col border-b border-divider pb-3">
      <div className="flex h-10 items-center justify-between gap-2 px-4">
        <h3 className="text-xs font-medium text-foreground">{title}</h3>
        <div className="flex items-center gap-1">{action}</div>
      </div>
      <div className="flex flex-col gap-2 px-4">{children}</div>
    </section>
  );
}

/** How a flex container places its items: nine dots, the lit one is where they sit. Turned a quarter for a column. */
export function AlignGrid({ column, justify, align, onChange }: { column: boolean; justify: string; align: string; onChange: (justify: string, align: string) => void }) {
  const ends = ["flex-start", "center", "flex-end"];
  const place = (value: string) => (value === "start" ? 0 : value === "end" ? 2 : ends.indexOf(value));
  const [along, across] = [place(justify), place(align)];
  return (
    <div role="group" aria-label="Alignment" className={`${well} grid size-20 shrink-0 grid-cols-3 grid-rows-3`}>
      {Array.from({ length: 9 }, (_, index) => {
        const [x, y] = [index % 3, Math.floor(index / 3)];
        const [j, a] = column ? [y, x] : [x, y];
        const on = along === j && across === a;
        return (
          <button
            key={index}
            type="button"
            aria-label={`${["Top", "Middle", "Bottom"][y]} ${["left", "centre", "right"][x]}`}
            aria-pressed={on}
            onClick={() => onChange(ends[j], ends[a])}
            className="group grid place-items-center"
          >
            <span className={`rounded-full transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${on ? "size-2 bg-[var(--selection)]" : "size-1 bg-foreground-subtle group-hover:bg-foreground-muted"}`} />
          </button>
        );
      })}
    </div>
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
      <span className="grid size-4 place-items-center rounded-[var(--r-sm)] bg-surface-inset text-transparent transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] peer-checked:bg-[var(--selection)] peer-checked:text-[var(--selection-foreground)] peer-focus-visible:ring-1 peer-focus-visible:ring-[var(--selection)]">
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

/** How a frame or an element flows what is in it, as one switch for every properties panel: nothing (freeform), a column, a row or a grid. Auto layout, whatever CSS it ends up as. */
export const FLOW_OPTIONS = [
  { value: "freeform", title: "Freeform", icon: <Glyph><rect x="2" y="2" width="5" height="5" rx="1.25" /><rect x="9" y="8" width="5" height="5" rx="1.25" /></Glyph> },
  { value: "column", title: "Vertical", icon: <Glyph><rect x="2" y="2" width="6" height="4" rx="1" /><rect x="2" y="10" width="6" height="4" rx="1" /><path d="M12 3v10M10 11l2 2 2-2" /></Glyph> },
  { value: "row", title: "Horizontal", icon: <Glyph><rect x="2" y="2" width="4" height="6" rx="1" /><rect x="9" y="2" width="4" height="6" rx="1" /><path d="M3 12h10M11 10l2 2-2 2" /></Glyph> },
  { value: "grid", title: "Grid", icon: <Glyph><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></Glyph> },
];

const pixels = (value: string) => (/^-?[\d.]+px$/.test(value) ? String(Math.round(parseFloat(value) * 100) / 100) : value);

/**
 * A number with a glyph in front. Type it, nudge it with the arrow keys (shift
 * to the next multiple of 8), or drag the glyph sideways (shift, eight at a time). `value` is what the page has now, as
 * CSS; `onCommit` is given what to set, as CSS.
 */
export function NumberField({
  glyph,
  label,
  value,
  onCommit,
  unit = "px",
  caption,
  trailing,
  mixed = false,
}: {
  glyph: ReactNode;
  label: string;
  value: string;
  onCommit: (css: string) => void;
  unit?: "px" | "opacity" | "number";
  /** Shown above the field. */
  caption?: string;
  /** At the end of the field, inside it. */
  trailing?: ReactNode;
  /** The things selected have different values: it says "Mixed" until a value is typed, which is then set on all of them. */
  mixed?: boolean;
}) {
  const shown = mixed ? "Mixed" : unit === "opacity" ? String(Math.round(parseFloat(value || "1") * 100)) : unit === "number" ? value : pixels(value);
  const [draft, setDraft] = useState<string | null>(null);
  const scrub = useRef<{ x: number; from: number } | null>(null);
  // Whether the press now under way is the one that put the cursor in the field.
  const fresh = useRef(false);

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
    <label className={`${well} flex h-7 items-center gap-1 pl-1.5 pr-1 text-xs focus-within:ring-1 focus-within:ring-[var(--selection)]`}>
      <span
        title={`${label} — drag to change`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          scrub.current = { x: event.clientX, from: current() };
        }}
        onPointerMove={(event) => {
          if (!scrub.current) return;
          const step = event.shiftKey ? 8 : 1;
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
        // Clicking in selects the whole number, so typing replaces it; the browser would undo that as the button comes up, so the first click's release is held back.
        onPointerDown={(event) => (fresh.current = document.activeElement !== event.currentTarget)}
        onFocus={(event) => event.target.select()}
        onMouseUp={(event) => {
          if (fresh.current) event.preventDefault();
          fresh.current = false;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const up = event.key === "ArrowUp";
            const now = current();
            // With Shift it goes to the next multiple of 8 (0 to 8, 8 to 16, 5 to 8 and down to 0), so a value stays on the grid.
            onCommit(css(event.shiftKey ? (up ? Math.floor(now / 8 + 1e-9) + 1 : Math.ceil(now / 8 - 1e-9) - 1) * 8 : now + (up ? 1 : -1)));
            setDraft(null);
          }
        }}
        className={`h-full min-w-0 flex-1 bg-transparent outline-none ${mixed && draft === null ? "text-foreground-muted" : "text-foreground"}`}
      />
      {trailing}
    </label>
    </Field>
  );
}

/**
 * How big something is along one axis, as one field: its size, with "Fill" or "Hug" beside it when it follows its surroundings or its
 * content. The chevron at the end changes which; the size can be typed whichever it is, and typing one makes it fixed.
 */
export function SizeField({
  glyph,
  label,
  mode,
  value,
  onCommit,
  onMode,
  modes = ["fixed", "fill", "hug"],
}: {
  glyph: ReactNode;
  label: string;
  mode: "fixed" | "fill" | "hug";
  value: string;
  onCommit: (css: string) => void;
  onMode: (mode: "fixed" | "fill" | "hug") => void;
  /** The ways it can be sized; with only one there is nothing to choose, so no menu. */
  modes?: ("fixed" | "fill" | "hug")[];
}) {
  const menu = modes.length < 2 ? null : (
    <span className="relative grid size-5 shrink-0 place-items-center text-foreground-subtle">
      <ChevronDownIcon className="size-3.5" />
      <select
        aria-label={`${label} sizing`}
        value={mode}
        onChange={(event) => onMode(event.target.value as "fixed" | "fill" | "hug")}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {modes.map((one) => (
          <option key={one} value={one}>
            {one === "fixed" ? "Fixed" : one === "fill" ? "Fill" : "Hug"}
          </option>
        ))}
      </select>
    </span>
  );
  // The number is typed in whatever the mode: in hug or fill it shows what the size comes to now, and entering one makes the size fixed (`onCommit` is what sets it),
  // with the mode named beside it until then.
  return (
    <NumberField
      glyph={glyph}
      label={label}
      value={value}
      onCommit={onCommit}
      trailing={
        <>
          {mode === "fixed" ? null : <span className="shrink-0 text-foreground">{mode === "fill" ? "Fill" : "Hug"}</span>}
          {menu}
        </>
      }
    />
  );
}

/** The small chevron at the end of a number field that offers common values to pick: the field itself is still typed in. */
export function PresetMenu({ label, options, onPick }: { label: string; options: number[]; onPick: (value: number) => void }) {
  return (
    <span className="relative grid size-5 shrink-0 place-items-center text-foreground-subtle">
      <ChevronDownIcon className="size-3.5" />
      <select
        aria-label={label}
        value=""
        onChange={(event) => event.target.value && onPick(Number(event.target.value))}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="" hidden />
        {options.map((one) => (
          <option key={one} value={one}>
            {one}
          </option>
        ))}
      </select>
    </span>
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
        className={`${well} h-7 w-full px-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-[var(--selection)]`}
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
            value === option.value ? "!bg-[var(--selection)] text-[var(--selection-foreground)]" : "text-foreground-muted hover:text-foreground"
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
export function ColorField({ label, value, onCommit, caption, trailing, onChip }: { label: string; value: string; onCommit: (css: string) => void; caption?: string; trailing?: ReactNode; /** Tapping the swatch does this, in place of opening the system colour picker. */ onChip?: () => void }) {
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
    <label className={`${well} flex h-7 items-center gap-2 pl-1.5 pr-1 text-xs focus-within:ring-1 focus-within:ring-[var(--selection)]`}>
      <span
        // The swatch shows the colour the page really has, so it is set from the page's own value.
        style={none ? undefined : { backgroundColor: value }}
        className={`relative size-4 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-border ${none ? "bg-surface" : ""}`}
      >
        {none ? <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-foreground-subtle" /> : null}
        {onChip ? (
          <button type="button" aria-label={`${label}, colours`} onClick={onChip} className="absolute inset-0 size-full cursor-pointer" />
        ) : (
          <input
            type="color"
            aria-label={`${label} picker`}
            value={hex || "#ffffff"}
            onChange={(event) => onCommit(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        )}
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
      {trailing}
    </label>
    </Field>
  );
}

/** One of a page's design tokens, to choose from. `css` is what choosing it sets; `hex` is its colour, for a swatch. */
export type TokenOption = { key: string; label: string; css: string; hex?: string };

const CUSTOM = "\0custom";

/**
 * A value chosen from the page's design tokens: the field shows the token the part has now and a menu of the rest,
 * with "Custom" last. A value that is no token's is shown as typed, in `custom` (the free field for that kind of
 * value, given the menu to put at its end), so it can still be changed or put back on a token. Tokens are the way;
 * custom is the way out.
 */
export function TokenField({
  glyph,
  label,
  options,
  selected,
  onPick,
  custom,
}: {
  glyph: ReactNode;
  label: string;
  options: TokenOption[];
  /** The key of the token the part has now, or null when its value is none of them. */
  selected: string | null;
  onPick: (option: TokenOption) => void;
  custom: (menu: ReactNode) => ReactNode;
}) {
  const [typing, setTyping] = useState(false);
  const chevron = <ChevronDownIcon className="size-3.5" />;
  const choose = (key: string) => {
    if (key === CUSTOM) return setTyping(true);
    const option = options.find((item) => item.key === key);
    if (!option) return;
    setTyping(false);
    onPick(option);
  };
  const menu = (cover: string) => (
    <select aria-label={`${label}, tokens`} value={selected ?? CUSTOM} onChange={(event) => choose(event.target.value)} className={`absolute cursor-pointer opacity-0 ${cover}`}>
      {options.map((option) => (
        <option key={option.key} value={option.key}>
          {option.label}
        </option>
      ))}
      <option value={CUSTOM}>Custom</option>
    </select>
  );
  if (!options.length) return custom(null);
  if (typing || selected === null) {
    return custom(
      <span className="relative grid size-5 shrink-0 place-items-center text-foreground-subtle">
        {chevron}
        {menu("inset-0 size-full")}
      </span>,
    );
  }
  const chosen = options.find((option) => option.key === selected);
  return (
    <div className={`${well} relative flex h-7 items-center gap-1 pl-1.5 pr-1 text-xs focus-within:ring-1 focus-within:ring-[var(--selection)]`}>
      <span className="flex w-5 shrink-0 items-center justify-center text-foreground-subtle">
        {chosen?.hex ? <span style={{ backgroundColor: chosen.hex }} className="size-4 rounded-[var(--r-sm)] border border-border" /> : glyph}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{chosen?.label}</span>
      <span className="grid size-5 shrink-0 place-items-center text-foreground-subtle">{chevron}</span>
      {menu("inset-0 size-full")}
    </div>
  );
}

/**
 * A colour chosen from the design system's: the swatch (or the field) opens a list of every colour with its swatch
 * and name, and "Custom" last, which turns the field into a hex to type. Tokens are the way; custom is the way out.
 */
export function ColourField({
  label,
  options,
  selected,
  value,
  onPick,
  onCommit,
}: {
  label: string;
  options: TokenOption[];
  /** The key of the colour the part has now, or null when it is none of them. */
  selected: string | null;
  /** The colour as the page has it now, for a swatch of one that is none of them. */
  value: string;
  onPick: (option: TokenOption) => void;
  onCommit: (css: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const show = () => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const up = window.innerHeight - box.bottom < 280 && box.top > window.innerHeight - box.bottom;
    setPlace({ left: box.left, top: up ? box.top - 4 : box.bottom + 4, width: box.width, up });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  if (!options.length) return <ColorField label={label} value={value} onCommit={onCommit} />;

  const chosen = options.find((option) => option.key === selected);
  const custom = typing || selected === null;
  const list =
    open && place
      ? createPortal(
          <div
            // A press inside it is not "outside": the list closes on its own choices.
            onPointerDown={(event) => event.stopPropagation()}
            style={{ left: place.left, top: place.top, width: place.width, transform: place.up ? "translateY(-100%)" : undefined }}
            role="listbox"
            aria-label={label}
            className="fixed z-[var(--z-popover)] max-h-64 overflow-y-auto rounded-[var(--r-md)] border border-border bg-surface-elevated py-1 text-xs shadow-floating"
          >
            {options.map((option) => (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={option.key === selected && !typing}
                onClick={() => {
                  setTyping(false);
                  setOpen(false);
                  onPick(option);
                }}
                className="flex h-8 w-full items-center gap-2 px-2 text-left text-foreground hover:bg-surface-hover"
              >
                <span style={option.hex ? { backgroundColor: option.hex } : undefined} className="size-4 shrink-0 rounded-[var(--r-sm)] border border-border" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.key === selected && !typing ? <CheckIcon className="size-3.5 text-foreground-muted" /> : null}
              </button>
            ))}
            <button
              type="button"
              role="option"
              aria-selected={custom}
              onClick={() => {
                setTyping(true);
                setOpen(false);
              }}
              className="mt-1 flex h-8 w-full items-center gap-2 border-t border-divider px-2 text-left text-foreground-muted hover:bg-surface-hover hover:text-foreground"
            >
              <span className="size-4 shrink-0" />
              Custom
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={anchor}>
      {custom ? (
        <ColorField
          label={label}
          value={value}
          onCommit={onCommit}
          onChip={show}
          trailing={
            <button type="button" aria-label={`${label}, colours`} onClick={show} className="grid size-5 shrink-0 place-items-center text-foreground-subtle">
              <ChevronDownIcon className="size-3.5" />
            </button>
          }
        />
      ) : (
        <button type="button" aria-label={`${label}, colours`} aria-expanded={open} onClick={show} className={`${well} flex h-7 w-full items-center gap-2 pl-1.5 pr-1 text-xs focus-visible:ring-1 focus-visible:ring-[var(--selection)] focus-visible:outline-none`}>
          <span style={chosen?.hex ? { backgroundColor: chosen.hex } : undefined} className="relative size-4 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-border">
            {chosen?.hex ? null : <span aria-hidden className="absolute inset-x-0 top-1/2 h-px -rotate-45 bg-foreground-subtle" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-foreground">{chosen?.label}</span>
          <span className="grid size-5 shrink-0 place-items-center text-foreground-subtle">
            <ChevronDownIcon className="size-3.5" />
          </span>
        </button>
      )}
      {list}
    </div>
  );
}
