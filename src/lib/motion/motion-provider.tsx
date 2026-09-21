"use client";

import { LayoutGroup, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

import { motionRegister } from "./vocabulary";

/**
 * Global motion context.
 *
 * `reducedMotion="user"` makes Motion honour the OS setting for transform and
 * layout animations automatically, while leaving opacity animations intact —
 * the behaviour we want, since the state change must still be visible.
 *
 * A single top-level LayoutGroup lets shared-element transitions work across
 * route boundaries: a prototype card on the hub and the prototype header on
 * the detail page can carry the same layoutId and be treated as one object.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={motionRegister.normal}>
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}
