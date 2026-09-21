# Motion guide

Companion to the principles in `CLAUDE.md`. This file answers "which tool do I
reach for", so that a new interaction built six months from now still speaks
the same language.

## Which mechanism

**Shared layout transition** (`layoutId`) — the same object exists in two
places and should travel between them. Hub row → prototype header. Preview →
focus mode. Version item → selected version. Active nav pill.
The ids live in `src/lib/motion/layout-ids.ts`. Two elements may not carry the
same id at the same time, so the origin renders a placeholder while the object
is elsewhere (see `PrototypeDetail` focus mode).

**Layout animation** (`layout`) — the object stays put but its position or size
changes because the structure around it changed. Grid ⇄ list, filtering,
expanding a section, reflowing at a breakpoint.

**Presence** (`AnimatePresence`) — something enters or leaves. Menus, sheets,
modals, popovers, contextual controls, changing content. Animate the parent,
not each child, unless the children genuinely arrive as a group.

**Plain CSS transition** — a single property changes on an element that is
already there: hover colour, border, opacity of a control. Cheaper than Motion
and it reads at a glance in the markup. Use the `--dur-*` and `--curve-*`
tokens.

**Nothing** — the change is instant and self-explanatory, or the element is one
of many changing at once. Not animating is a valid, frequent answer.

## Registers

Use `useMotionLanguage()` and name a register: `gentle`, `normal`, `emphasis`,
`spatial`, `immersive`. See the table in `CLAUDE.md`. Never write a duration or
cubic-bézier inline.

## Reduced motion

Two layers, both always on:

1. `MotionConfig reducedMotion="user"` in `MotionProvider` — Motion drops
   transform and layout animation, keeps opacity.
2. `useMotionLanguage().distance()` / `.scale()` — returns 0 / 1 when reduced,
   so offsets and scales collapse at the call site.
3. `motion.css` zeroes the CSS travel variables and shortens durations under
   the media query, and view transitions are disabled entirely.

The rule: remove movement, keep the state change. A reduced-motion user must
still see that something happened.

## Performance

Animate `transform` and `opacity`. Layout animation is projection-based and
cheap per element but not free in bulk — stagger a list of ten, not a hundred.
Never animate `width`/`height`/`top`/`left` directly when a transform will do.
