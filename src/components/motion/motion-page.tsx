"use client";

import { motion as m } from "motion/react";
import type { ReactNode } from "react";

import { useMotionLanguage, type NavigationDirection } from "@/lib/motion";

/**
 * MotionPage — the page-level transition.
 *
 * Deliberately small. Shared elements carry the meaning of a navigation; this
 * only handles the content that has no counterpart on the other side, settling
 * it in from the direction the user travelled. Going deeper, content comes up
 * from below; coming back out, it comes down from above. Lateral moves get no
 * offset, because there is no spatial claim to make.
 *
 * Normally rendered for you by RouteTransition — use it directly only for a
 * view that is not a route.
 */
export function MotionPage({
  children,
  className,
  direction = "lateral",
}: {
  children: ReactNode;
  className?: string;
  direction?: NavigationDirection;
}) {
  const motion = useMotionLanguage();
  const offset = direction === "lateral" ? 0 : motion.distance("md");
  const from = direction === "backward" ? -offset : offset;

  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: from }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -from }}
      transition={motion.enter("normal")}
    >
      {children}
    </m.div>
  );
}
