/**
 * The maths behind the canvas's alignment guides and its measuring (hold Alt), over plain rectangles in the canvas's own
 * units. No DOM or React is imported, so it is checked in Node (scripts/check-geometry.mjs).
 *
 *  - `snapMove` is for moving something: where its edges and middle line up with those of other things, the nudge that makes
 *    them line up (when they are near enough) and the lines to draw along each alignment.
 *  - `measure` is for measuring between two things: the lines from one to the other and how long each is.
 */
export type Rect = { id: string; x: number; y: number; width: number; height: number };

/** A line along an alignment: vertical (`axis: "x"`, at that x) or horizontal (`axis: "y"`, at that y), from `from` to `to` along the other axis. */
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };

/** A measured distance: a segment from (x1, y1) to (x2, y2), its length in the canvas's units. */
export type Span = { x1: number; y1: number; x2: number; y2: number; length: number };

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** The three lines a rectangle can line up by on each axis: its start, its middle and its end. */
const stops = (start: number, size: number) => [start, start + size / 2, start + size];

/** The nudge along one axis that lines the moving rectangle's nearest stop up with a target's, or 0 when none is within `threshold`. */
function nudge(moving: number[], targets: number[], threshold: number) {
  let best: number | null = null;
  for (const m of moving) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best ?? 0;
}

/**
 * Where a rectangle being moved lines up with others. `threshold` is how near counts, in the canvas's units (so a distance on
 * screen divided by the zoom). Each axis is independent: it can snap to one thing across and another down. The guides are
 * the lines along every alignment that holds once it has snapped, each spanning the two rectangles it joins.
 */
export function snapMove(moving: Rect, targets: Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const dx = nudge(stops(moving.x, moving.width), targets.flatMap((t) => stops(t.x, t.width)), threshold);
  const dy = nudge(stops(moving.y, moving.height), targets.flatMap((t) => stops(t.y, t.height)), threshold);
  const at = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  for (const t of targets) {
    for (const m of stops(at.x, at.width)) {
      for (const line of stops(t.x, t.width)) {
        if (same(m, line)) guides.push({ axis: "x", at: m, from: Math.min(at.y, t.y), to: Math.max(at.y + at.height, t.y + t.height) });
      }
    }
    for (const m of stops(at.y, at.height)) {
      for (const line of stops(t.y, t.height)) {
        if (same(m, line)) guides.push({ axis: "y", at: m, from: Math.min(at.x, t.x), to: Math.max(at.x + at.width, t.x + t.width) });
      }
    }
  }
  return { dx, dy, guides: merge(guides) };
}

/** Guides on the same line are one: the longest span that covers them. */
function merge(guides: Guide[]) {
  const found: Guide[] = [];
  for (const g of guides) {
    const twin = found.find((other) => other.axis === g.axis && same(other.at, g.at));
    if (twin) {
      twin.from = Math.min(twin.from, g.from);
      twin.to = Math.max(twin.to, g.to);
    } else found.push({ ...g });
  }
  return found;
}

/** The overlap of two ranges, or null when they don't meet. */
const overlap = (a1: number, a2: number, b1: number, b2: number): [number, number] | null => {
  const [from, to] = [Math.max(a1, b1), Math.min(a2, b2)];
  return from < to ? [from, to] : null;
};

/**
 * The distances between two rectangles, `a` the one measured from (what is selected) and `b` the one measured to (what is
 * pointed at), along each axis:
 *  - apart: one span across the gap between the facing edges;
 *  - one inside the other: a span from each side of the inner one to the outer one's edge on that side;
 *  - crossing: a span between the two starts and between the two ends.
 * Each span sits in the middle of where the two overlap on the other axis, or in the middle of `a` when they don't.
 */
export function measure(a: Rect, b: Rect): Span[] {
  const spans: Span[] = [];
  const across = (a1: number, a2: number, b1: number, b2: number) => {
    const shared = overlap(a1, a2, b1, b2);
    return shared ? (shared[0] + shared[1]) / 2 : (a1 + a2) / 2;
  };
  const axis = (horizontal: boolean) => {
    const [a1, a2, b1, b2] = horizontal ? [a.x, a.x + a.width, b.x, b.x + b.width] : [a.y, a.y + a.height, b.y, b.y + b.height];
    const at = horizontal ? across(a.y, a.y + a.height, b.y, b.y + b.height) : across(a.x, a.x + a.width, b.x, b.x + b.width);
    const span = (from: number, to: number) => {
      if (same(from, to)) return;
      const [lo, hi] = from < to ? [from, to] : [to, from];
      spans.push(horizontal ? { x1: lo, y1: at, x2: hi, y2: at, length: hi - lo } : { x1: at, y1: lo, x2: at, y2: hi, length: hi - lo });
    };
    if (b1 >= a2) span(a2, b1);
    else if (b2 <= a1) span(b2, a1);
    else if (b1 <= a1 && b2 >= a2) {
      // `b` holds `a`: its edges are the room around it.
      span(b1, a1);
      span(a2, b2);
    } else if (a1 <= b1 && a2 >= b2) {
      span(a1, b1);
      span(b2, a2);
    } else {
      span(a1, b1);
      span(a2, b2);
    }
  };
  axis(true);
  axis(false);
  return spans;
}
