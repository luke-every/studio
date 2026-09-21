"use client";

import { AnimatePresence, motion as m } from "motion/react";
import type { ReactNode } from "react";

import { useMotionLanguage, useOverlayBehaviour } from "@/lib/motion";

import { MotionScrim } from "./motion-scrim";

/**
 * MotionFocusLayer — a mode change, not a dialog.
 *
 * Focus mode is the one place the interface fully takes over the screen, and
 * the object being focused must be the same object that was on the page a
 * moment ago. So the layer itself animates nothing but the scrim and its
 * controls: the caller renders the shared element inside, carrying the same
 * layoutId it had in the page, and Motion moves it from where it was to where
 * it now belongs.
 *
 * Its counterpart, FocusPlaceholder, holds the vacated space in the page so
 * nothing reflows underneath while the object is away.
 */
export function MotionFocusLayer({
  open,
  onClose,
  children,
  label,
  controls,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  /** Rendered top-right, fading in once the object has settled. */
  controls?: ReactNode;
}) {
  const motion = useMotionLanguage();
  const container = useOverlayBehaviour({ open, onClose });

  return (
    <AnimatePresence>
      {open ? (
        <div
          ref={container}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="fixed inset-0 flex items-center justify-center p-4 outline-none sm:p-10"
          style={{ zIndex: "var(--z-focus-mode)" }}
        >
          <MotionScrim onClick={onClose} register="immersive" />

          <div className="relative flex w-full items-center justify-center">{children}</div>

          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              ...motion.enter("gentle"),
              delay: motion.reduced ? 0 : 0.12,
            }}
            className="absolute right-5 top-5 flex items-center gap-2"
          >
            {controls}
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--r-full)] border border-border bg-surface-elevated px-3 py-1.5 text-xs text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-surface-hover"
            >
              Close
            </button>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Holds the space an object left behind while it is in focus mode, so the
 * page underneath does not collapse and then jump back when it returns.
 */
export function FocusPlaceholder({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-[var(--r-lg)] border border-dashed border-border ${className ?? ""}`}
    />
  );
}
