"use client";

import { motion as m } from "motion/react";
import type { MouseEvent } from "react";

import { layoutId, useMotionLanguage } from "@/lib/motion";
import { themePreferences, useTheme, type ThemePreference } from "@/lib/theme";

const label: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * Light, dark or the system's choice — three options side by side, on the
 * settings page.
 *
 * It used to be a menu at the foot of the side nav, which opened downward
 * and off the bottom of the window. Three options don't need a menu; laid
 * out in the page there is nothing to open and nowhere for it to fall.
 * The change is still revealed from the point of the click.
 */
export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const motion = useMotionLanguage();

  const choose = (next: ThemePreference) => (event: MouseEvent<HTMLButtonElement>) => {
    setPreference(next, { x: event.clientX, y: event.clientY });
  };

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-[var(--r-sm)] border border-border p-0.5"
    >
      {themePreferences.map((option) => {
        const selected = preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={choose(option)}
            className={`relative h-8 rounded-[var(--r-xs)] px-3 text-xs transition-colors duration-[var(--dur-fast)] ${
              selected ? "text-foreground" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {selected ? (
              <m.span
                layoutId={layoutId.themeIndicator}
                transition={motion.enter("gentle")}
                className="absolute inset-0 rounded-[var(--r-xs)] bg-surface-hover"
              />
            ) : null}
            <span className="relative">{label[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
