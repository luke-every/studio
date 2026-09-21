"use client";

import { AnimatePresence, motion as m } from "motion/react";
import type { ReactNode } from "react";

import { useMotionLanguage, useOverlayBehaviour } from "@/lib/motion";

import { MotionScrim } from "./motion-scrim";

/**
 * MotionModal — a focused decision, centred.
 *
 * It grows slightly into place rather than dropping in, and shrinks back on
 * the way out, so the reverse of opening is literally the reverse. Escape,
 * scroll lock, focus trap and focus restoration come from useOverlayBehaviour.
 *
 * Use it when the user must deal with something before continuing. If they do
 * not have to, it should not be a modal.
 */
export function MotionModal({
  open,
  onClose,
  children,
  label,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const motion = useMotionLanguage();
  const container = useOverlayBehaviour({ open, onClose });

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 grid place-items-center p-4"
          style={{ zIndex: "var(--z-modal)" }}
        >
          <MotionScrim onClick={onClose} />
          <m.div
            ref={container}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            initial={{ opacity: 0, scale: motion.scale(0.96), y: motion.distance("sm") }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: motion.scale(0.98), y: motion.distance("sm") }}
            transition={motion.enter("normal")}
            className={`relative w-full max-w-[32rem] rounded-[var(--r-lg)] border border-border bg-surface-elevated p-6 shadow-[var(--elev-overlay)] outline-none ${className ?? ""}`}
          >
            {children}
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
