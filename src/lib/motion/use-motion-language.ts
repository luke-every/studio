"use client";

import { useReducedMotion } from "motion/react";

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
  const reduced = useReducedMotion() ?? false;

  return {
    reduced,
    /** Transition for an element arriving or changing. */
    enter: (register: MotionRegister = "normal") => motionRegister[register],
    /** Transition for an element leaving. */
    exit: (register: MotionRegister = "normal") => exitRegister[register],
    /** Vertical/horizontal offset in px, zero when motion is reduced. */
    distance: (token: TravelToken) => (reduced ? 0 : travel[token]),
    /** Scale delta, flattened to 1 when motion is reduced. */
    scale: (value: number) => (reduced ? 1 : value),
  };
}
