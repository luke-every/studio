import type { Transition } from "motion/react";

import { duration, easing, spring } from "./tokens";

/**
 * The motion vocabulary.
 *
 * Rather than inventing a transition per component, every animation in
 * Prototype Studio picks one of five registers. The register is chosen by what
 * the change *means*, not by how it should look:
 *
 *   gentle     A property changed in place — hover, selection, theme, colour.
 *   normal     Something entered or left — menus, popovers, list changes.
 *   emphasis   Something demands a beat of attention — confirmation, a new
 *              item arriving, a status changing.
 *   spatial    An object moved between two contexts — card → detail,
 *              preview → focus mode, version → selected version.
 *   immersive  The user changed mode entirely — entering a prototype,
 *              entering or leaving focus mode.
 *
 * If a new interaction does not fit one of these, that is a signal to question
 * the interaction, not to add a sixth register.
 */
export const motionRegister = {
  gentle: {
    duration: duration.fast,
    ease: easing.standard,
  },
  normal: {
    duration: duration.standard,
    ease: easing.entrance,
  },
  emphasis: {
    duration: duration.deliberate,
    ease: easing.entrance,
  },
  spatial: spring.spatial,
  immersive: {
    duration: duration.immersive,
    ease: easing.spatial,
  },
} as const satisfies Record<string, Transition>;

export type MotionRegister = keyof typeof motionRegister;

/** Exit transitions accelerate away rather than easing out. */
export const exitRegister = {
  gentle: { duration: duration.instant, ease: easing.exit },
  normal: { duration: duration.fast, ease: easing.exit },
  emphasis: { duration: duration.fast, ease: easing.exit },
  spatial: spring.spatial,
  immersive: { duration: duration.standard, ease: easing.exit },
} as const satisfies Record<MotionRegister, Transition>;

/**
 * Stagger is used sparingly, and only when items genuinely arrive as a group
 * (a list of prototypes, a timeline of versions). It is never applied to
 * unrelated elements that merely happen to be on screen together.
 */
export const stagger = {
  tight: 0.02,
  normal: 0.04,
  editorial: 0.06,
} as const;
