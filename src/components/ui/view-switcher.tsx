"use client";

import { motion as m } from "motion/react";

import { MOTION_ENABLED, layoutId, useMotionLanguage } from "@/lib/motion";
import type { ViewMode } from "@/lib/use-view-mode";

const options: { mode: ViewMode; label: string }[] = [
  { mode: "grid", label: "Grid" },
  { mode: "list", label: "List" },
];

function GridGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-3">
      <g fill="currentColor">
        <rect x="0" y="0" width="5" height="5" rx="1" />
        <rect x="7" y="0" width="5" height="5" rx="1" />
        <rect x="0" y="7" width="5" height="5" rx="1" />
        <rect x="7" y="7" width="5" height="5" rx="1" />
      </g>
    </svg>
  );
}

function ListGlyph() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="size-3">
      <g fill="currentColor">
        <rect x="0" y="1" width="12" height="2" rx="1" />
        <rect x="0" y="5" width="12" height="2" rx="1" />
        <rect x="0" y="9" width="12" height="2" rx="1" />
      </g>
    </svg>
  );
}

/**
 * Changing view mode is a change to the same set of objects, so the control
 * says so: the selected state is one pill that slides between the two
 * options, at the same moment the layout beneath rearranges.
 */
export function ViewSwitcher({
  mode,
  onChange,
  scope = "default",
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Keeps the sliding indicator unique when two switchers are on screen. */
  scope?: string;
}) {
  const motion = useMotionLanguage();

  return (
    <div className="flex items-center gap-0.5 rounded-[var(--r-sm)] border border-border p-0.5">
      {options.map((option) => {
        const selected = option.mode === mode;

        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange(option.mode)}
            aria-pressed={selected}
            aria-label={`${option.label} view`}
            className={`relative flex size-6 items-center justify-center rounded-[var(--r-xs)] transition-colors duration-[var(--dur-fast)] ${
              selected ? "text-foreground" : "text-foreground-subtle hover:text-foreground-muted"
            }`}
          >
            {selected ? (
              MOTION_ENABLED ? (
                <m.span
                  layoutId={`${layoutId.viewModeIndicator}:${scope}`}
                  transition={motion.enter("spatial")}
                  className="absolute inset-0 rounded-[var(--r-xs)] bg-surface-hover"
                />
              ) : (
                <span className="absolute inset-0 rounded-[var(--r-xs)] bg-surface-hover" />
              )
            ) : null}
            <span className="relative">
              {option.mode === "grid" ? <GridGlyph /> : <ListGlyph />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
