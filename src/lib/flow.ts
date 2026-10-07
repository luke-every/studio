import { z } from "zod";

/**
 * A prototype's flow: the screens it is made of and the taps that lead
 * between them, shown on the studio's canvas.
 *
 * It lives in the same `studio.json` as the controls, so a version carries
 * the flow that matches its own code. A screen is reached the way a control
 * is: by URL parameters on the prototype's address, so the prototype needs no
 * studio code in it. /push writes the flow when the prototype has more than
 * one screen, and leaves it out when it hasn't.
 */

const screen = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The URL parameters that open the prototype on this screen. */
  params: z.record(z.string(), z.string()).default({}),
});

export const flowSchema = z.object({
  flow: z.object({
    screens: z.array(screen).min(2),
    edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() })).default([]),
  }),
});

export type Flow = z.infer<typeof flowSchema>["flow"];
export type FlowScreen = Flow["screens"][number];

/** The address with a screen's parameters set on it (keeping any already there, such as controls). */
export function withParams(url: string, params: Record<string, string>) {
  const [path, query = ""] = url.split("?");
  const merged = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) merged.set(key, value);
  const text = merged.toString();
  return text ? `${path}?${text}` : path;
}

export type Placed = { x: number; y: number };

/** How many steps away from the first screen each screen is. Screens nothing leads to come last. */
function stepsFromStart(flow: Flow) {
  const depth = new Map<string, number>();
  const queue = [flow.screens[0].id];
  depth.set(queue[0], 0);
  for (let i = 0; i < queue.length; i++) {
    for (const edge of flow.edges) {
      if (edge.from === queue[i] && !depth.has(edge.to)) {
        depth.set(edge.to, depth.get(queue[i])! + 1);
        queue.push(edge.to);
      }
    }
  }
  const last = Math.max(...depth.values());
  return new Map(flow.screens.map(({ id }) => [id, depth.get(id) ?? last + 1]));
}

/**
 * Where each screen goes: a column for each step away from the first screen,
 * screens that share a step stacked in that column. A long flow wraps onto
 * further rows after `perRow` columns, like text, so it doesn't run off as a
 * strip too thin to read.
 */
export function layoutFlow(flow: Flow, cell: { width: number; height: number }, perRow = Infinity) {
  const steps = stepsFromStart(flow);
  const stacked = new Map<number, number>();
  const slot = new Map<string, { step: number; row: number }>();
  for (const { id } of flow.screens) {
    const step = steps.get(id)!;
    const row = stacked.get(step) ?? 0;
    stacked.set(step, row + 1);
    slot.set(id, { step, row });
  }

  // Each band of columns is as tall as its tallest column.
  const bands: number[] = [];
  for (const [step, count] of stacked) {
    const band = Math.floor(step / perRow);
    bands[band] = Math.max(bands[band] ?? 0, count);
  }
  const offsets = bands.map((_, i) => bands.slice(0, i).reduce((sum, rows) => sum + rows, 0));

  const placed = new Map<string, Placed>();
  for (const [id, { step, row }] of slot) {
    placed.set(id, { x: (step % perRow) * cell.width, y: (offsets[Math.floor(step / perRow)] + row) * cell.height });
  }
  const columns = Math.min(perRow, Math.max(...stacked.keys()) + 1);
  return { placed, width: columns * cell.width, height: bands.reduce((sum, rows) => sum + rows, 0) * cell.height, columns: Math.max(...stacked.keys()) + 1 };
}

/** How many columns to a row make the whole flow as large as it can be on screen in this room. */
export function bestPerRow(flow: Flow, cell: { width: number; height: number }, room: { width: number; height: number }) {
  const total = layoutFlow(flow, cell).columns;
  let best = total;
  let bestScale = 0;
  for (let n = total; n >= 1; n--) {
    const { width, height } = layoutFlow(flow, cell, n);
    const scale = Math.min(room.width / width, room.height / height);
    if (scale > bestScale * 1.02) {
      best = n;
      bestScale = scale;
    }
  }
  return best;
}
