"use client";

import { AnimatePresence, motion as m } from "motion/react";
import type { ReactNode } from "react";

import { useMotionLanguage } from "@/lib/motion";

/**
 * MotionPanel — progressive disclosure in place.
 *
 * For content that expands where it already is: older versions, extra detail,
 * a section opening up. The surrounding layout is pushed rather than covered,
 * which is the whole point — the user keeps their place.
 *
 * Height is animated here, which does cost layout. It is the honest way to do
 * a disclosure, and these are small, single, user-initiated changes. Do not
 * reach for this to animate many elements at once.
 */
export function MotionPanel({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  const motion = useMotionLanguage();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <m.div
          key="panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{
            height: motion.enter("normal"),
            opacity: { ...motion.enter("gentle"), delay: motion.reduced ? 0 : 0.05 },
          }}
          className={`overflow-hidden ${className ?? ""}`}
        >
          {children}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
