"use client";

import { motion as m } from "motion/react";

import { useMotionLanguage } from "@/lib/motion";
import type { ReactNode } from "react";

/**
 * MotionPage — the only page-level transition in the product.
 *
 * It is deliberately quiet: content settles into place while shared elements
 * do the real work of explaining the move. If you find yourself wanting a
 * louder page transition, the shared element is probably missing.
 */
export function MotionPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const motion = useMotionLanguage();

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: motion.distance("sm") }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -motion.distance("sm") }}
      transition={motion.enter("normal")}
    >
      {children}
    </m.div>
  );
}
