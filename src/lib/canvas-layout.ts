/**
 * Auto layout for what is on the canvas: reading how a few things are arranged (side by side or stacked, how far apart, how they
 * line up) and flowing them that way. Pure, in whatever unit the caller uses (the canvas passes real pixels), so it can be checked
 * in Node (scripts/check-layout.mjs).
 */
export type Box = { id: string; x: number; y: number; width: number; height: number };
export type Layout = {
  direction: "row" | "column";
  gap: number;
  align: "start" | "center" | "end";
  padding: number;
  /** Padding for just the sides (left and right) or the ends (top and bottom) when it differs from `padding`. */
  paddingX?: number;
  paddingY?: number;
  /** `between` spreads what is in it to the ends of the room along the direction (the gap is then the least); otherwise it is packed from the start. */
  justify?: "start" | "between";
};
/** The padding along x and along y. */
export const paddingOf = (layout: Layout) => ({ x: layout.paddingX ?? layout.padding, y: layout.paddingY ?? layout.padding });

/** The website's own spacing: Tailwind's default scale, which it doesn't override (`gap-1` is 4px, `gap-6` 24px). */
export const SPACING = [0, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 80, 96, 112, 128, 144, 160, 192, 224, 256];

/** The nearest step on the scale; a gap that is not near one (further than 3px) is kept as it is. */
export function snapSpacing(px: number): number {
  const value = Math.max(0, px);
  const near = SPACING.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best), 0);
  return Math.abs(near - value) <= 3 ? near : Math.round(value);
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** How the boxes are arranged: the direction they run in, the gap between neighbours and how they line up across it. */
export function detectLayout(boxes: Box[]): Layout {
  let across = 0;
  let down = 0;
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      across += overlap(a.y, a.y + a.height, b.y, b.y + b.height);
      down += overlap(a.x, a.x + a.width, b.x, b.x + b.width);
    }
  // Side by side shares height; stacked shares width. With neither (a scatter), whichever way the centres are more spread out.
  let direction: Layout["direction"] = "row";
  if (down > across) direction = "column";
  else if (down === across && boxes.length > 1) {
    const cx = boxes.map((one) => one.x + one.width / 2);
    const cy = boxes.map((one) => one.y + one.height / 2);
    if (Math.max(...cy) - Math.min(...cy) > Math.max(...cx) - Math.min(...cx)) direction = "column";
  }
  const row = direction === "row";
  const start = (one: Box) => (row ? one.x : one.y);
  const length = (one: Box) => (row ? one.width : one.height);
  const sorted = [...boxes].sort((a, b) => start(a) + length(a) / 2 - (start(b) + length(b) / 2));
  const gaps = sorted.slice(1).map((one, i) => Math.max(0, start(one) - (start(sorted[i]) + length(sorted[i]))));
  const middle = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  const cross = (one: Box) => (row ? [one.y, one.height] : [one.x, one.width]);
  const spread = (value: (one: Box) => number) => (boxes.length ? Math.max(...boxes.map(value)) - Math.min(...boxes.map(value)) : 0);
  const options: [Layout["align"], number][] = [
    ["start", spread((one) => cross(one)[0])],
    ["center", spread((one) => cross(one)[0] + cross(one)[1] / 2)],
    ["end", spread((one) => cross(one)[0] + cross(one)[1])],
  ];
  const fitting = options.filter(([, apart]) => apart <= 2).sort((a, b) => a[1] - b[1])[0];
  return { direction, gap: snapSpacing(middle), align: fitting?.[0] ?? "start", padding: 0 };
}

/**
 * Where each box goes, from (0, 0), in the order they now sit along the direction, and how big the whole is. `inner` is the room the frame
 * gives them when it has a size of its own (its inside, along and across the direction): across, they line up in it; along, `between` spreads them over it.
 */
export function flow(boxes: Box[], layout: Layout, inner?: { cross?: number; main?: number }): { positions: Record<string, { x: number; y: number }>; width: number; height: number } {
  const row = layout.direction === "row";
  const pad = paddingOf(layout);
  const [padMain, padCross] = row ? [pad.x, pad.y] : [pad.y, pad.x];
  const along = (one: Box) => (row ? one.x + one.width / 2 : one.y + one.height / 2);
  const sorted = [...boxes].sort((a, b) => along(a) - along(b));
  const crossSize = Math.max(inner?.cross ?? 0, ...boxes.map((one) => (row ? one.height : one.width)));
  const used = boxes.reduce((sum, one) => sum + (row ? one.width : one.height), 0);
  const gap = layout.justify === "between" && inner?.main !== undefined && sorted.length > 1 ? Math.max(layout.gap, (inner.main - used) / (sorted.length - 1)) : layout.gap;
  const positions: Record<string, { x: number; y: number }> = {};
  let cursor = padMain;
  for (const one of sorted) {
    const own = row ? one.height : one.width;
    const room = crossSize - own;
    const offset = padCross + (layout.align === "center" ? room / 2 : layout.align === "end" ? room : 0);
    positions[one.id] = row ? { x: cursor, y: offset } : { x: offset, y: cursor };
    cursor += (row ? one.width : one.height) + gap;
  }
  const main = sorted.length ? cursor - gap + padMain : padMain * 2;
  const cross = crossSize + padCross * 2;
  return { positions, width: row ? main : cross, height: row ? cross : main };
}
