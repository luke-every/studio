"use client";

import { FitIcon } from "@/components/shell/nav-icons";

/** Scale the preview to the room there is, instead of a set size. */
export function FitButton({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`flex items-center gap-2 whitespace-nowrap rounded-[var(--r-tag)] px-3 py-2 text-sm font-medium ${
        active ? "bg-accent text-accent-foreground" : "bg-surface text-foreground hover:bg-surface-hover"
      }`}
    >
      <FitIcon className="size-3.5" />
      Fit
    </button>
  );
}
