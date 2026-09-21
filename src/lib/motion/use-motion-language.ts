"use client";

import { useReducedMotion } from "motion/react";

import { INSTANT, MOTION_ENABLED } from "./config";
import { exitRegister, motionRegister, type MotionRegister } from "./vocabulary";
import { travel, type TravelToken } from "./tokens";

/**
 * The single hook components use to speak the motion language.
 *
 * It returns transitions from the vocabulary plus a `distance` helper that
 * collapses to zero under `prefers-reduced-motion`. Reduced motion removes
 * *movement*, not *meaning*: opacity and state changes still happen, so the
 * interface continues to explain itself.
 *
 *   const motion = useMotionLanguage();
 *   <m.div
 *     initial={{ opacity: 0, y: motion.distance("md") }}
 *     animate={{ opacity: 1, y: 0 }}
 *     transition={motion.enter("normal")}
 *   />
 */
export function useMotionLanguage() {
  const prefersReduced = useReducedMotion() ?? false;
  // With the global switch off, every caller behaves as if motion were reduced.
  const reduced = prefersReduced || !MOTION_ENABLED;

  return {
    reduced,
    enabled: MOTION_ENABLED,
    /** Transition for an element arriving or changing. */
    enter: (register: MotionRegister = "normal") =>
      MOTION_ENABLED ? motionRegister[register] : INSTANT,
    /** Transition for an element leaving. */
    exit: (register: MotionRegister = "normal") =>
      MOTION_ENABLED ? exitRegister[register] : INSTANT,
    /** Vertical/horizontal offset in px, zero when motion is reduced. */
    distance: (token: TravelToken) => (reduced ? 0 : travel[token]),
    /** Scale delta, flattened to 1 when motion is reduced. */
    scale: (value: number) => (reduced ? 1 : value),
    /** A shared layout id, or undefined while motion is off. */
    shared: (id: string) => (MOTION_ENABLED ? id : undefined),
  };
}
