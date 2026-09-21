"use client";

import { motion as m } from "motion/react";

import { useMotionLanguage, type MotionRegister } from "@/lib/motion";

/**
 * The shared backdrop behind any layer that takes over the screen. One
 * component so modals, sheets and focus mode dim the page identically and at
 * the same rate as whatever they are presenting.
 */
export function MotionScrim({
  onClick,
  register = "normal",
}: {
  onClick?: () => void;
  register?: MotionRegister;
}) {
  const motion = useMotionLanguage();

  return (
    <m.div
      aria-hidden
      onClick={onClick}
      className="absolute inset-0 bg-scrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motion.enter(register)}
    />
  );
}
