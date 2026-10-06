"use client";

import { useState, type MouseEvent } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/lib/theme";

import { MoonIcon, SunIcon, SystemIcon } from "./nav-icons";

const options: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "system", label: "System", icon: SystemIcon },
  { value: "dark", label: "Night", icon: MoonIcon },
  { value: "light", label: "Day", icon: SunIcon },
];

/** System, night or day, from a menu that opens under the button. */
export function ThemeMenu() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  const choose = (value: ThemePreference) => (event: MouseEvent<HTMLButtonElement>) => {
    setPreference(value, { x: event.clientX, y: event.clientY });
    setOpen(false);
  };

  const Current = resolved === "dark" ? MoonIcon : SunIcon;

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-36"
      trigger={
        <IconButton
          label="Theme"
          variant="ghost"
          tooltipAlign="end"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <Current className="size-[1.125rem]" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="Theme" className="flex flex-col">
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={preference === value}
            onClick={choose(value)}
            className={`flex items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm hover:bg-surface-hover ${
              preference === value ? "text-foreground" : "text-foreground-muted"
            }`}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
    </MotionPopover>
  );
}
