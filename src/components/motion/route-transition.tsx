"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useNavigationDirection } from "@/lib/motion";

import { MotionPage } from "./motion-page";

/**
 * RouteTransition — keeps both sides of a navigation mounted for a moment.
 *
 * This is what makes shared elements work across routes: the outgoing view is
 * still in the tree when the incoming one mounts, so an element carrying the
 * same layoutId on both sides is recognised as one object and travels between
 * them instead of one view fading out while another fades in.
 *
 * `mode="popLayout"` rather than `"wait"`, so the incoming view never waits
 * for the outgoing one to finish — a transition must not delay interaction.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const direction = useNavigationDirection();

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <MotionPage key={pathname} direction={direction} className="min-h-full">
        {children}
      </MotionPage>
    </AnimatePresence>
  );
}
