"use client";

import { AnimatePresence, motion as m } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

import { useMotionLanguage } from "@/lib/motion";
import { themePreferences, useTheme, type ThemePreference } from "@/lib/theme";

const label: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/**
 * A small menu with a clear origin: it opens from the control that summoned
 * it, anchored to its top-right corner, and closes back into it. The theme
 * change itself is revealed from the point of the click (see ThemeProvider).
 */
export function ThemeSwitcher() {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const motion = useMotionLanguage();
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (next: ThemePreference) => (event: MouseEvent<HTMLButtonElement>) => {
    setPreference(next, { x: event.clientX, y: event.clientY });
    setOpen(false);
  };

  return (
    <div ref={container} className="relative">
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

      <AnimatePresence>
        {open ? (
          <m.div
            role="menu"
            initial={{ opacity: 0, scale: motion.scale(0.94), y: -motion.distance("sm") }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: motion.scale(0.96), y: -motion.distance("sm") }}
            transition={motion.enter("normal")}
            style={{ transformOrigin: "top right", zIndex: "var(--z-popover)" }}
            className="absolute right-0 top-[calc(100%+0.5rem)] w-36 overflow-hidden rounded-[var(--r-md)] border border-border bg-surface-elevated p-1 shadow-[var(--elev-floating)]"
          >
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
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
