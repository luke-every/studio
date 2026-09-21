/**
 * Motion tokens — the TypeScript mirror of src/styles/motion.css.
 *
 * CSS transitions read the custom properties; Motion for React reads these.
 * The two must stay in sync, so both are edited together and nothing else in
 * the codebase is allowed to hardcode a duration or an easing curve.
 */

/** Durations in seconds, as Motion expects them. */
export const duration = {
  instant: 0.08,
  fast: 0.16,
  standard: 0.28,
  deliberate: 0.46,
  immersive: 0.62,
} as const;

/** Cubic-bézier control points, matching --curve-* in motion.css. */
export const easing = {
  standard: [0.32, 0.72, 0, 1],
  entrance: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  spatial: [0.22, 1, 0.36, 1],
} as const;

/**
 * Springs are used only where an element is being directly manipulated or is
 * travelling between two real positions on screen. They are configured here
 * and nowhere else, and they are deliberately close to critically damped —
 * physical, not bouncy.
 */
export const spring = {
  /** Shared-element travel: card → detail, preview → focus mode. */
  spatial: { type: "spring", stiffness: 320, damping: 38, mass: 0.9 },
  /** Layout rearrangement: grid ⇄ list, filtering, sorting. */
  layout: { type: "spring", stiffness: 420, damping: 44, mass: 0.8 },
  /** Direct manipulation: drag, press, pointer-following. */
  direct: { type: "spring", stiffness: 560, damping: 42, mass: 0.6 },
} as const;

/** Movement distances in pixels, matching --motion-travel-* in motion.css. */
export const travel = {
  lift: 2,
  sm: 6,
  md: 14,
  lg: 28,
} as const;

export type DurationToken = keyof typeof duration;
export type EasingToken = keyof typeof easing;
export type SpringToken = keyof typeof spring;
export type TravelToken = keyof typeof travel;
