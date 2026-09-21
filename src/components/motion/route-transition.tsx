"use client";

import { AnimatePresence } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { MOTION_ENABLED, useNavigationDirection } from "@/lib/motion";

import { MotionPage } from "./motion-page";

/**
 * RouteTransition — keeps both sides of a navigation mounted for a moment, so
 * shared elements can travel across a route change.
 *
 * While the global motion switch is off this does nothing at all: the route
 * renders directly, with no presence wrapper in the navigation path. Keeping
 * AnimatePresence here with zero-duration transitions is not equivalent — an
 * exiting tree that never animates can hold the incoming view in an empty
 * frame, which is exactly the failure this avoids.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const direction = useNavigationDirection();

  if (!MOTION_ENABLED) return <>{children}</>;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <MotionPage key={pathname} direction={direction} className="min-h-full">
        {children}
      </MotionPage>
    </AnimatePresence>
  );
}
