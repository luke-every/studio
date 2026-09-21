"use client";

import { motion as m } from "motion/react";
import type { ReactNode } from "react";

import { motionRegister, spring, stagger, useMotionLanguage } from "@/lib/motion";

/**
 * MotionList / MotionItem — a group of things that arrive together and
 * rearrange together.
 *
 * Two real problems, one primitive:
 *
 * 1. Arrival. Items appear as a group with a small stagger, so the eye is led
 *    down the list instead of being hit with everything at once. The stagger
 *    is capped — past the cap, later items arrive at the same time, because a
 *    long list should not become a queue the user has to wait out.
 *
 * 2. Rearrangement. Every item is a layout-animated element with a stable
 *    key, so changing the view mode, filtering or sorting moves the actual
 *    objects to their new positions rather than replacing the list.
 */

const MAX_STAGGERED_ITEMS = 8;

export function MotionList({
  children,
  className,
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul" | "ol" | "section";
}) {
  const MotionComponent = m[Component];

  return (
    <MotionComponent layout className={className} transition={spring.layout}>
      {children}
    </MotionComponent>
  );
}

export function MotionItem({
  children,
  className,
  index = 0,
  rhythm = "normal",
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Position in the group — drives the arrival stagger. */
  index?: number;
  rhythm?: keyof typeof stagger;
  as?: "div" | "li" | "article";
}) {
  const motion = useMotionLanguage();
  const MotionComponent = m[Component];
  const delay = Math.min(index, MAX_STAGGERED_ITEMS) * stagger[rhythm];

  return (
    <MotionComponent
      layout
      className={className}
      initial={{ opacity: 0, y: motion.distance("md") }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -motion.distance("sm") }}
      transition={{
        layout: motionRegister.spatial,
        default: { ...motion.enter("normal"), delay },
        opacity: { ...motion.enter("normal"), delay },
      }}
    >
      {children}
    </MotionComponent>
  );
}
