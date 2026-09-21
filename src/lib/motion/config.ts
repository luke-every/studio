/**
 * Global motion switch.
 *
 * Off: every state change is instant. Layers still mount and unmount, layouts
 * still rearrange, but nothing is animated and no element is projected from
 * one position to another.
 *
 * The vocabulary, the tokens and the primitives all stay in place and read
 * this flag, so motion can be reintroduced deliberately — one interaction at
 * a time — rather than all at once by default.
 */
export const MOTION_ENABLED = false;

/** A transition that finishes before it starts. */
export const INSTANT = { duration: 0 } as const;
