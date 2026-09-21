"use client";

import { AnimatePresence, motion as m } from "motion/react";
import type { ReactNode } from "react";

import { spring, useMotionLanguage, useOverlayBehaviour } from "@/lib/motion";

import { MotionScrim } from "./motion-scrim";

/**
 * MotionSheet — secondary content that slides in from an edge.
 *
 * On narrow screens this is where history, prototype information and settings
 * live. It arrives from the edge it is attached to, and it can be thrown back
 * at that edge: the drag is direct manipulation, and releasing past a
 * threshold — or fast enough — commits the dismissal, so the gesture and the
 * animation are the same motion.
 *
 * Dragging is disabled under reduced motion, where the sheet simply appears
 * and the close control does the work.
 */
export function MotionSheet({
  open,
  onClose,
  children,
  label,
  side = "bottom",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  side?: "bottom" | "right";
  className?: string;
}) {
  const motion = useMotionLanguage();
  const container = useOverlayBehaviour({ open, onClose });

  const fromBottom = side === "bottom";
  const hidden = fromBottom ? { y: "100%" } : { x: "100%" };
  const shown = fromBottom ? { y: 0 } : { x: 0 };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
          <MotionScrim onClick={onClose} />
          <m.aside
            ref={container}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            initial={motion.reduced ? { opacity: 0 } : hidden}
            animate={motion.reduced ? { opacity: 1 } : shown}
            exit={motion.reduced ? { opacity: 0 } : hidden}
            transition={spring.spatial}
            drag={motion.reduced ? false : fromBottom ? "y" : "x"}
            dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
            dragElastic={{ top: 0, bottom: 0.7, left: 0, right: 0.7 }}
            onDragEnd={(_, info) => {
              const distance = fromBottom ? info.offset.y : info.offset.x;
              const velocity = fromBottom ? info.velocity.y : info.velocity.x;
              if (distance > 120 || velocity > 600) onClose();
            }}
            className={
              fromBottom
                ? `absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[var(--r-xl)] border-t border-border bg-surface-elevated p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--elev-overlay)] outline-none ${className ?? ""}`
                : `absolute inset-y-0 right-0 w-full max-w-[26rem] overflow-y-auto border-l border-border bg-surface-elevated p-6 shadow-[var(--elev-overlay)] outline-none ${className ?? ""}`
            }
          >
            {fromBottom && !motion.reduced ? (
              <div
                aria-hidden
                className="mx-auto mb-4 h-1 w-9 rounded-full bg-border-strong"
              />
            ) : null}
            {children}
          </m.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
