"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";

import { MotionPopover } from "@/components/motion";
import { IconButton } from "@/components/ui/button";
import { useTheme, type ThemePreference } from "@/lib/theme";

import { BellIcon, MenuIcon, MoonIcon, SettingsIcon, SunIcon, SystemIcon } from "./nav-icons";

const themes: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Day", icon: SunIcon },
  { value: "dark", label: "Night", icon: MoonIcon },
  { value: "system", label: "System", icon: SystemIcon },
];

const item =
  "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-nav hover:bg-surface-hover";

/**
 * On a phone there isn't room for notifications, theme and settings as three
 * buttons, so they share one menu.
 */
export function MobileMenu() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);

  const choose = (value: ThemePreference) => (event: MouseEvent<HTMLButtonElement>) => {
    setPreference(value, { x: event.clientX, y: event.clientY });
    setOpen(false);
  };

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-52"
      trigger={
        <IconButton
          label="Menu"
          variant="ghost"
          tooltipAlign="end"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MenuIcon className="size-5" />
        </IconButton>
      }
    >
      <div role="menu" aria-label="Menu" className="flex flex-col">
        <button type="button" role="menuitem" onClick={() => setOpen(false)} className={`${item} text-foreground`}>
          <BellIcon />
          Notifications
        </button>

        <p className="px-2.5 pb-1 pt-2 text-eyebrow">Theme</p>
        {themes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={preference === value}
            onClick={choose(value)}
            className={`${item} ${preference === value ? "text-foreground" : "text-foreground-muted"}`}
          >
            <Icon />
            {label}
          </button>
        ))}

        <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className={`${item} mt-1 border-t border-divider text-foreground`}>
          <SettingsIcon />
          Settings
        </Link>
      </div>
    </MotionPopover>
  );
}
