/**
 * The canvas's camera: where the world is and how far it is zoomed, kept outside React.
 *
 * The view used to be React state, so every wheel step re-rendered the whole canvas just to change one transform. Here the
 * camera owns the view, and writes it straight to the world element once per animation frame, only while it is changing:
 *
 *  - `target` is where the view is going, `current` is what is drawn. A hand-driven move sets both at once; an eased move
 *    (`ease`) walks `current` toward `target` at a rate that doesn't depend on the frame rate.
 *  - The pan is snapped to whole device pixels, so text and hairlines inside the world stay sharp.
 *  - A glide (`glide`) is the browser's own CSS transition, set by the camera on the same write, so a jump to a new place
 *    still animates with the studio's motion tokens (passed in as `glideTransition`, never written here).
 *  - Anything that has to stay one size however far you zoom can ride along with no React at all: the camera publishes the
 *    scale as `--cam-s` on the `vars` element, so a label placed under it and scaled by `calc(1 / var(--cam-s))` keeps its
 *    on-screen size. That element must not contain the screens: a custom property that changes makes the browser restyle
 *    every element inside, which for many static copies is tens of thousands of elements per zoom step.
 *
 * No DOM or React is imported, so the maths can be checked in Node (scripts/check-camera.mjs).
 */

export type View = { x: number; y: number; scale: number };
export type Limits = { min: number; max: number };

/** What the camera writes to. Every element is optional: a camera with none still keeps the view. */
export type Targets = {
  /** Gets `transform`. */
  world?: HTMLElement | null;
  /** Gets `--cam-s`, the scale, for what is placed under it and scaled by its inverse. Keep it to a small layer: see above. */
  vars?: HTMLElement | null;
  /** A dot grid that follows the view: gets `background-size` and `background-position`. */
  grid?: HTMLElement | null;
  /** The grid's spacing in the world's own units. */
  gridStep?: number;
};

export type Options = {
  limits: Limits;
  /** The share of the remaining distance an eased move covers per 1/120 s. */
  ease?: number;
  /** The CSS `transition` written with a glide: one for the world, one for the grid. */
  glideTransition?: { world: string; grid: string };
  /** Injected for tests; the browser's by default. */
  raf?: (callback: (time: number) => void) => number;
  cancelRaf?: (id: number) => void;
  dpr?: () => number;
};

export type Move = {
  /** Walk toward the target over a few frames instead of arriving at once. */
  ease?: boolean;
  /** Let the browser's CSS transition animate to the target. */
  glide?: boolean;
};

export const clampScale = (scale: number, { min, max }: Limits) => Math.min(max, Math.max(min, scale));

/** The view after zooming by `factor` about the point (px, py), which stays where it is on screen. */
export function zoomAbout(view: View, px: number, py: number, factor: number, limits: Limits): View {
  const scale = clampScale(view.scale * factor, limits);
  const k = scale / view.scale;
  return { scale, x: px - (px - view.x) * k, y: py - (py - view.y) * k };
}

/** The pan on whole device pixels. */
export function snapView(view: View, dpr: number): View {
  return { scale: view.scale, x: Math.round(view.x * dpr) / dpr, y: Math.round(view.y * dpr) / dpr };
}

const STEP_MS = 1000 / 120;

/**
 * One frame of easing from `from` toward `to`, `dt` milliseconds after the last. Within a device pixel of the pan, and of
 * the scale's effect across `extent` pixels, it has arrived, so it stops instead of creeping.
 */
export function easeView(from: View, to: View, ease: number, dt: number, dpr: number, extent: number): { view: View; arrived: boolean } {
  const t = 1 - (1 - ease) ** (Math.max(dt, 0) / STEP_MS);
  const next = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, scale: from.scale + (to.scale - from.scale) * t };
  const pixel = 1 / dpr;
  const arrived = Math.abs(to.x - next.x) < pixel && Math.abs(to.y - next.y) < pixel && (Math.abs(to.scale - next.scale) / next.scale) * extent < pixel;
  return { view: arrived ? { ...to } : next, arrived };
}

const same = (a: View, b: View) => a.x === b.x && a.y === b.y && a.scale === b.scale;

export class CanvasCamera {
  private goal: View;
  private shown: View;
  private targets: Targets = {};
  private glideNext = false;
  private easing = false;
  private frame = 0;
  private last = 0;
  private dirty = true;
  private extent = 1000;
  private readonly options: Options;
  private readonly onTarget = new Set<() => void>();
  private readonly onFrame = new Set<(view: View) => void>();

  constructor(initial: View, options: Options) {
    this.goal = { ...initial };
    this.shown = { ...initial };
    this.options = options;
  }

  /** Where the view is going. The same object until it changes, so it can be a React external-store snapshot. */
  get target(): View {
    return this.goal;
  }

  /** What is drawn this frame. */
  get current(): View {
    return this.shown;
  }

  /** Whether a frame is still to be drawn. */
  get moving(): boolean {
    return this.frame !== 0;
  }

  /** The element(s) to write to, and the window's longer side (for knowing when a zoom has arrived). Writes the view at once. */
  attach(targets: Targets, extent?: number) {
    this.targets = targets;
    if (extent) this.extent = extent;
    if (targets.world) targets.world.style.backfaceVisibility = "hidden";
    this.dirty = true;
    this.draw(false);
  }

  /** Go to `view`. A hand-driven move (the default) is drawn at once on the next frame. */
  set(view: View, move: Move = {}) {
    const limits = this.options.limits;
    const next = { x: view.x, y: view.y, scale: clampScale(view.scale, limits) };
    if (same(next, this.goal) && !this.easing && !this.dirty) return;
    this.goal = next;
    this.glideNext = !!move.glide;
    this.easing = !!move.ease && !move.glide;
    // Anything but an eased move arrives now; the browser animates a glide.
    if (!this.easing) this.shown = { ...next };
    this.dirty = true;
    this.schedule();
    for (const listener of this.onTarget) listener();
  }

  /** Go to what `change` makes of where the view is going, so several steps before a frame add up. */
  update(change: (now: View) => View, move?: Move) {
    this.set(change(this.goal), move);
  }

  panBy(dx: number, dy: number) {
    this.set({ ...this.goal, x: this.goal.x + dx, y: this.goal.y + dy });
  }

  /** Zoom by `factor` about a point in the canvas's own window. */
  zoomAt(px: number, py: number, factor: number, move?: Move) {
    this.update((now) => zoomAbout(now, px, py, factor, this.options.limits), move);
  }

  /** Told when the target changes, before anything is drawn: for React, which wants the target at once. */
  subscribe = (listener: () => void) => {
    this.onTarget.add(listener);
    return () => {
      this.onTarget.delete(listener);
    };
  };

  /** Told after each frame is drawn, with what was drawn: for what has to follow the camera (culling, a heads-up layer). */
  subscribeFrame(listener: (view: View) => void) {
    this.onFrame.add(listener);
    return () => {
      this.onFrame.delete(listener);
    };
  }

  /** Lets go of the elements and stops drawing, but keeps who is listening: for a camera that outlives its element (React may mount again). */
  detach() {
    if (this.frame) (this.options.cancelRaf ?? cancelAnimationFrame)(this.frame);
    this.frame = 0;
    this.targets = {};
  }

  dispose() {
    if (this.frame) (this.options.cancelRaf ?? cancelAnimationFrame)(this.frame);
    this.frame = 0;
    this.onTarget.clear();
    this.onFrame.clear();
  }

  private schedule() {
    if (this.frame) return;
    const raf = this.options.raf ?? requestAnimationFrame;
    this.frame = raf(this.tick);
  }

  private tick = (time: number) => {
    this.frame = 0;
    const dt = this.last ? time - this.last : STEP_MS;
    this.last = time;
    const dpr = this.options.dpr?.() ?? window.devicePixelRatio;
    if (this.easing) {
      const step = easeView(this.shown, this.goal, this.options.ease ?? 0.6, dt, dpr, this.extent);
      this.shown = step.view;
      this.dirty = true;
      if (step.arrived) this.easing = false;
    }
    if (this.dirty) this.draw(this.glideNext);
    for (const listener of this.onFrame) listener(this.shown);
    // Eased moves keep going; anything else is drawn and done, and the clock restarts for the next move.
    if (this.easing) this.schedule();
    else this.last = 0;
  };

  private draw(glide: boolean) {
    this.dirty = false;
    const { world, vars, grid, gridStep = 24 } = this.targets;
    const dpr = this.options.dpr?.() ?? (typeof window === "undefined" ? 1 : window.devicePixelRatio);
    // A glide is the browser's: it animates between exact values, so only a hand-driven or eased frame is snapped.
    const view = glide ? this.shown : snapView(this.shown, dpr);
    const transition = this.options.glideTransition;
    if (world) {
      world.style.transform = `matrix3d(${view.scale},0,0,0,0,${view.scale},0,0,0,0,1,0,${view.x},${view.y},0,1)`;
      world.style.transition = glide && transition ? transition.world : "";
    }
    vars?.style.setProperty("--cam-s", String(view.scale));
    if (grid) {
      grid.style.backgroundSize = `${gridStep * view.scale}px ${gridStep * view.scale}px`;
      grid.style.backgroundPosition = `${view.x}px ${view.y}px`;
      grid.style.transition = glide && transition ? transition.grid : "";
    }
  }
}
