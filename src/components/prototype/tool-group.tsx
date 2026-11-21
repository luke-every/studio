"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ChevronDownIcon } from "@/components/shell/nav-icons";
import { controlOn, IconButton } from "@/components/ui/button";

/** A menu that is open closes on a press away from it or Escape (which is not also heard by whatever is behind it). */
function useDismiss(open: boolean, root: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => !root.current?.contains(event.target as Node) && close();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", escape, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` is remade each render; only opening and closing matter
  }, [open]);
}

/** One thing a tool group offers: a tool to hold (it becomes the group's button), or an action to do once (`action`, the group's button stays as it was). */
export type ToolOption = { id: string; label: string; icon: ReactNode; shortcut?: string; action?: boolean };

/**
 * A button in the canvas's bar with more behind it, as Figma's are: the button holds the tool last chosen from the group, and the small chevron beside it opens
 * the rest above it, each with its shortcut and a tick on the one in hand.
 */
export function ToolGroup({ options, current, active, onChoose, onActivate }: { options: ToolOption[]; current: string; active: boolean; /** Chosen from the menu. */ onChoose: (id: string) => void; /** The button itself pressed: the tool last chosen. */ onActivate: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const shown = options.find((option) => option.id === current) ?? options[0];
  useDismiss(open, root, () => setOpen(false));
  return (
    <div ref={root} className="relative flex items-center">
      <IconButton tooltipSide="above" label={shown.shortcut ? `${shown.label} (${shown.shortcut})` : shown.label} variant="ghost" aria-pressed={active} className={active ? controlOn : ""} onClick={onActivate}>
        {shown.icon}
      </IconButton>
      <button
        type="button"
        aria-label={`More ${shown.label.toLowerCase()} tools`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((now) => !now)}
        className={`grid h-9 w-6 place-items-center rounded-[var(--r-control)] text-foreground-subtle transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover hover:text-foreground ${open ? "bg-surface-hover text-foreground" : ""}`}
      >
        <ChevronDownIcon className="size-3 rotate-180" />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full left-0 mb-3 flex w-56 flex-col rounded-[var(--r-tile)] border border-border bg-surface-elevated p-1 shadow-floating">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onChoose(option.id);
              }}
              className={`flex h-8 items-center gap-2 rounded-[var(--r-control)] px-2 text-left text-xs transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-inset ${option.id === current && !option.action ? "text-foreground" : "text-foreground-muted hover:text-foreground"}`}
            >
              <span aria-hidden className="grid size-4 shrink-0 place-items-center text-foreground">
                {option.id === current && !option.action ? "✓" : ""}
              </span>
              <span className="grid size-4 shrink-0 place-items-center">{option.icon}</span>
              <span className="flex-1">{option.label}</span>
              {option.shortcut ? <span className="text-foreground-subtle">{option.shortcut}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
