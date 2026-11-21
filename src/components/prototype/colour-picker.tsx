"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ColorField, Field } from "@/components/prototype/edit-fields";
import { ChevronDownIcon, CheckIcon, CloseIcon, PlusIcon, SearchIcon } from "@/components/shell/nav-icons";
import { Button } from "@/components/ui/button";
import { designTokensOf } from "@/lib/registry/actions";

type Token = { name: string; value: string };

/** The tokens made here, kept in this browser only: they are never written to the design system or to a prototype. */
const LOCAL_KEY = "canvas:local-colour-tokens";

/** The same colour written two ways compares equal: both are read by the browser into its own spelling. */
function spelled(css: string) {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return css.toLowerCase();
  context.fillStyle = "#000000";
  context.fillStyle = css;
  return context.fillStyle;
}

const slugOfPage = () => (window.location.pathname.startsWith("/prototypes/") ? window.location.pathname.split("/")[2] : "") || "stage";

// The design system's colours, asked for once per prototype and kept.
const known = new Map<string, Promise<Token[]>>();
const designColours = (slug: string) => {
  if (!known.has(slug)) known.set(slug, designTokensOf(slug).then((result) => (result.ok ? result.value : [])));
  return known.get(slug)!;
};

const readLocal = (): Token[] => {
  try {
    const found = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "[]") as Token[];
    return Array.isArray(found) ? found.filter((one) => typeof one?.name === "string" && typeof one?.value === "string") : [];
  } catch {
    return [];
  }
};
const writeLocal = (tokens: Token[]) => {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(tokens));
  } catch {
    // Not kept: the token is there until the page closes.
  }
};

/** A hex and an opacity, as one CSS colour. */
function withOpacity(hex: string, percent: number) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return percent >= 100 ? hex.toLowerCase() : `rgba(${r}, ${g}, ${b}, ${Math.round(Math.max(0, percent)) / 100})`;
}

const swatch = "size-4 shrink-0 rounded-[var(--r-sm)] border border-border";

/**
 * A colour chosen from the design system's: the field shows the token the colour is (or its hex, when it is none) and opens a panel beside the properties
 * with a search and every colour in a list, the one in use marked. A plus makes a new one, kept under "Local" and only on this machine.
 */
export function TokenColourField({ label, caption, value, onCommit, trailing }: { label: string; caption?: string; value: string; onCommit: (css: string) => void; trailing?: React.ReactNode }) {
  const [design, setDesign] = useState<Token[]>([]);
  const [local, setLocal] = useState<Token[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [making, setMaking] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number; height: number } | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  // The colours are asked for once, when the field is there.
  useEffect(() => {
    let stale = false;
    void designColours(slugOfPage()).then((tokens) => !stale && setDesign(tokens));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- what is kept in this browser can only be read once the page is there
    setLocal(readLocal());
    return () => {
      stale = true;
    };
  }, []);

  const tokens = [...design, ...local];
  const now = spelled(value);
  const chosen = tokens.find((one) => spelled(one.value) === now);

  const show = () => {
    const field = anchor.current?.getBoundingClientRect();
    if (!field) return;
    // Beside the properties card, to its left, level with the field (and kept in the window).
    const card = anchor.current?.closest("[data-properties]")?.getBoundingClientRect();
    const width = 320;
    const top = Math.max(8, Math.min(field.top - 8, window.innerHeight - 360));
    setPlace({ left: Math.max(8, (card?.left ?? field.left) - width - 8), top, height: window.innerHeight - top - 16 });
    setQuery("");
    setMaking(false);
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const pick = (token: Token) => {
    onCommit(token.value);
    setOpen(false);
  };
  const words = query.trim().toLowerCase();
  const matching = (list: Token[]) => list.filter((one) => !words || one.name.toLowerCase().includes(words));
  const row = (token: Token, mine: boolean) => (
    <div key={`${mine ? "local" : "design"}-${token.name}`} className="group/row flex items-center">
      <button
        type="button"
        role="option"
        aria-selected={chosen === token}
        onClick={() => pick(token)}
        className={`flex h-9 min-w-0 flex-1 items-center gap-3 px-4 text-left text-sm transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover ${chosen === token ? "bg-[var(--selection-muted)] text-[var(--selection)]" : "text-foreground"}`}
      >
        <span style={{ backgroundColor: token.value }} className={`${swatch} size-5 rounded-full`} />
        <span className="min-w-0 flex-1 truncate">{token.name}</span>
        {chosen === token ? <CheckIcon className="size-3.5 shrink-0" /> : null}
      </button>
      {mine ? (
        <button
          type="button"
          aria-label={`Remove ${token.name}`}
          onClick={() => {
            const next = local.filter((one) => one !== token);
            setLocal(next);
            writeLocal(next);
          }}
          className="mr-2 grid size-6 shrink-0 place-items-center rounded-[var(--r-control)] text-foreground-subtle opacity-0 transition-opacity duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:text-foreground group-hover/row:opacity-100 focus-visible:opacity-100"
        >
          <CloseIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );

  const panel =
    open && place
      ? createPortal(
          <div
            // A press inside it is not "outside": it closes on its own choices.
            onPointerDown={(event) => event.stopPropagation()}
            style={{ left: place.left, top: place.top, maxHeight: place.height }}
            role="dialog"
            aria-label={`${label}, colours`}
            className="fixed z-[var(--z-popover)] flex w-80 flex-col overflow-hidden rounded-[var(--r-tile)] border border-border bg-surface-elevated shadow-floating"
          >
            {making ? (
              <NewToken
                value={value}
                taken={tokens.map((one) => one.name.toLowerCase())}
                onBack={() => setMaking(false)}
                onCreate={(token) => {
                  const next = [...local, token];
                  setLocal(next);
                  writeLocal(next);
                  pick(token);
                }}
              />
            ) : (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-divider px-4">
                  <SearchIcon className="size-4 shrink-0 text-foreground-muted" />
                  <input
                    autoFocus
                    type="search"
                    aria-label="Search colours"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="h-12 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
                  />
                  <button type="button" aria-label="New colour" onClick={() => setMaking(true)} className="grid size-7 shrink-0 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground">
                    <PlusIcon className="size-4" />
                  </button>
                  <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-7 shrink-0 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground">
                    <CloseIcon className="size-4" />
                  </button>
                </div>
                <div role="listbox" aria-label={label} className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
                  {matching(design).map((token) => row(token, false))}
                  {matching(local).length ? (
                    <>
                      <h3 className="px-4 pb-1 pt-3 text-xs text-foreground-muted">Local</h3>
                      {matching(local).map((token) => row(token, true))}
                    </>
                  ) : null}
                  {!matching(design).length && !matching(local).length ? <p className="px-4 py-3 text-sm text-foreground-muted">No colour matches “{query.trim()}”.</p> : null}
                </div>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={anchor}>
      {chosen ? (
        <Field caption={caption}>
          <button
            type="button"
            aria-label={`${label}, colours`}
            aria-expanded={open}
            onClick={show}
            className={`flex h-7 w-full items-center gap-2 rounded-[var(--r-md)] bg-surface-inset pl-1.5 pr-1 text-xs transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] focus-visible:ring-1 focus-visible:ring-[var(--selection)] ${open ? "ring-1 ring-[var(--selection)]" : ""}`}
          >
            <span style={{ backgroundColor: chosen.value }} className={`${swatch} size-4 rounded-full`} />
            <span className={`min-w-0 flex-1 truncate text-left ${open ? "text-[var(--selection)]" : "text-foreground"}`}>{chosen.name}</span>
            {trailing}
            <span className="grid size-5 shrink-0 place-items-center text-foreground-subtle">
              <ChevronDownIcon className="size-3.5" />
            </span>
          </button>
        </Field>
      ) : (
        <ColorField
          label={label}
          caption={caption}
          value={value}
          onCommit={onCommit}
          onChip={show}
          trailing={
            <>
              {trailing}
              <button type="button" aria-label={`${label}, colours`} onClick={show} className="grid size-5 shrink-0 place-items-center text-foreground-subtle">
                <ChevronDownIcon className="size-3.5" />
              </button>
            </>
          }
        />
      )}
      {panel}
    </div>
  );
}

/** Making a colour: a name, its value and how opaque it is, kept as a local token. */
function NewToken({ value, taken, onBack, onCreate }: { value: string; taken: string[]; onBack: () => void; onCreate: (token: Token) => void }) {
  const [name, setName] = useState("");
  const [hex, setHex] = useState(() => {
    const spelt = spelled(value);
    return spelt.startsWith("#") ? spelt : "#000000";
  });
  const [opacity, setOpacity] = useState(100);
  const clash = taken.includes(name.trim().toLowerCase());
  const ready = !!name.trim() && !clash;
  const create = () => ready && onCreate({ name: name.trim(), value: withOpacity(hex, opacity) });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        create();
      }}
      className="flex flex-col gap-4 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">New colour</h3>
        <button type="button" aria-label="Back to the colours" onClick={onBack} className="grid size-7 place-items-center rounded-[var(--r-control)] text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset hover:text-foreground">
          <CloseIcon className="size-4" />
        </button>
      </div>
      <Field caption="Name">
        <input
          autoFocus
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={`h-8 w-full rounded-[var(--r-md)] bg-surface-inset px-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-[var(--selection)] ${clash ? "ring-1 ring-destructive" : ""}`}
        />
        {clash ? <span className="text-xs text-destructive">A colour has that name already. Choose another.</span> : null}
      </Field>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <ColorField label="Value" caption="Value" value={hex} onCommit={(css) => setHex(spelled(css).startsWith("#") ? spelled(css) : hex)} />
        <Field caption="Opacity">
          <label className="flex h-7 items-center gap-1 rounded-[var(--r-md)] bg-surface-inset px-2 text-xs focus-within:ring-1 focus-within:ring-[var(--selection)]">
            <input
              aria-label="Opacity"
              inputMode="numeric"
              value={opacity}
              onChange={(event) => setOpacity(Math.min(100, Math.max(0, Number(event.target.value.replace(/\D/g, "")) || 0)))}
              className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none"
            />
            <span className="text-foreground-subtle">%</span>
          </label>
        </Field>
      </div>
      <Button type="submit" variant="primary" disabled={!ready}>
        Create colour
      </Button>
    </form>
  );
}
