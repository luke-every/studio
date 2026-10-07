"use client";

import { FitIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";

/** Scale the preview to the room there is, instead of a set size. */
export function FitButton({ active, onChange }: { active: boolean; onChange: (active: boolean) => void }) {
  return (
    <IconButton
      label="Fit to the room"
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={active ? "!border-transparent !bg-accent !text-accent-foreground" : ""}
    >
      <FitIcon className="size-[1.125rem]" />
    </IconButton>
  );
}
