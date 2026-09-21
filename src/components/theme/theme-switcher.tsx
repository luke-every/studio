"use client";

import { motion as m } from "motion/react";
import { useState, type MouseEvent } from "react";

import { MotionPopover } from "@/components/motion";
import { useMotionLanguage } from "@/lib/motion";
import { themePreferences, useTheme, type ThemePreference } from "@/lib/theme";

const label: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Part of the interface rather than a settings screen: one control in the
 * masthead, a menu that grows out of it, and a theme change revealed from the
 * point of the click.
 */
export function ThemeSwitcher() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const motion = useMotionLanguage();

  const choose = (next: ThemePreference) => (event: MouseEvent<HTMLButtonElement>) => {
    setPreference(next, { x: event.clientX, y: event.clientY });
    setOpen(false);
  };

  return (
    <MotionPopover
      open={open}
      onClose={() => setOpen(false)}
      className="w-36"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-8 items-center gap-2 rounded-[var(--r-full)] border border-border px-3 text-xs text-foreground-muted transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover hover:text-foreground"
        >
          <span
            aria-hidden
            className="size-2.5 rounded-full border border-border-strong"
            style={{ background: resolved === "dark" ? "var(--ink-700)" : "var(--paper-50)" }}
          />
          {label[preference]}
        </button>
      }
    >
      <div role="menu">
        {themePreferences.map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={preference === option}
            onClick={choose(option)}
            className="relative flex w-full items-center justify-between rounded-[var(--r-sm)] px-2.5 py-1.5 text-left text-sm text-foreground-muted transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover hover:text-foreground"
          >
            {label[option]}
            {preference === option ? (
              <m.span
                layoutId="theme-choice"
                transition={motion.enter("gentle")}
                className="size-1.5 rounded-full bg-accent"
              />
            ) : null}
          </button>
        ))}
      </div>
    </MotionPopover>
  );
}
