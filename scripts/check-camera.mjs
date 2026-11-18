#!/usr/bin/env node
/**
 * Checks the camera's maths and its frame loop without a browser (Node runs the TypeScript directly):
 *
 *   node scripts/check-camera.mjs
 *
 * Prints nothing when everything holds, and the failures when something doesn't.
 */
import { CanvasCamera, easeView, snapView, zoomAbout } from "../src/lib/canvas-camera.ts";

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const limits = { min: 0.08, max: 4 };

// Zooming about a point leaves that point where it is on screen.
{
  const view = { x: 120, y: -40, scale: 0.5 };
  const [px, py] = [300, 200];
  const worldBefore = { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
  const after = zoomAbout(view, px, py, 2.4, limits);
  const worldAfter = { x: (px - after.x) / after.scale, y: (py - after.y) / after.scale };
  check("zoom keeps the point fixed", near(worldBefore.x, worldAfter.x, 1e-6) && near(worldBefore.y, worldAfter.y, 1e-6));
  check("zoom multiplies the scale", near(after.scale, 1.2));
}

// Zoom stops at the limits, and the point still holds there.
{
  const view = { x: 10, y: 10, scale: 3.9 };
  const after = zoomAbout(view, 50, 50, 10, limits);
  check("zoom stops at the maximum", after.scale === 4);
  check("zoom at the limit still holds the point", near((50 - after.x) / after.scale, (50 - view.x) / view.scale, 1e-6));
  check("zoom stops at the minimum", zoomAbout({ x: 0, y: 0, scale: 0.1 }, 0, 0, 0.01, limits).scale === 0.08);
}

// The pan lands on whole device pixels.
{
  const snapped = snapView({ x: 10.37, y: -4.62, scale: 1.3 }, 2);
  check("snaps to half pixels at 2x", snapped.x === 10.5 && snapped.y === -4.5 && snapped.scale === 1.3, JSON.stringify(snapped));
  check("snaps to whole pixels at 1x", snapView({ x: 10.49, y: 10.5, scale: 1 }, 1).x === 10);
}

// Easing covers the same ground in the same time at any frame rate, and stops when it arrives.
{
  const walk = (stepMs) => {
    let view = { x: 0, y: 0, scale: 1 };
    const to = { x: 400, y: 200, scale: 2 };
    for (let elapsed = 0; elapsed < 100; elapsed += stepMs) view = easeView(view, to, 0.6, stepMs, 2, 1000).view;
    return view;
  };
  const [a, b] = [walk(1000 / 60), walk(1000 / 144)];
  check("easing is frame-rate independent", near(a.x, b.x, 1) && near(a.scale, b.scale, 0.01), `${a.x} vs ${b.x}`);
  let view = { x: 0, y: 0, scale: 1 };
  let frames = 0;
  for (let arrived = false; !arrived && frames < 500; frames++) ({ view, arrived } = easeView(view, { x: 50, y: 0, scale: 1 }, 0.6, 1000 / 60, 2, 1000));
  check("easing arrives exactly", view.x === 50 && frames < 500, `${view.x} after ${frames} frames`);
}

// The camera: hand moves are drawn on the next frame, steps add up, eased moves walk, and it goes idle.
{
  const frames = [];
  let time = 0;
  const raf = (callback) => frames.push(callback);
  const style = () => ({ values: {}, setProperty(name, value) { this.values[name] = value; } });
  const world = { style: { ...style(), set transform(value) { this.values.transform = value; }, set transition(value) { this.values.transition = value; }, set backfaceVisibility(value) { this.values.backface = value; } } };
  const grid = { style: {} };
  const vars = { style: { values: {}, setProperty(name, value) { this.values[name] = value; } } };
  const options = { limits, raf, cancelRaf: () => {}, dpr: () => 2, glideTransition: { world: "world-glide", grid: "grid-glide" } };
  const camera = new CanvasCamera({ x: 0, y: 0, scale: 1 }, options);
  camera.attach({ world, grid, vars, gridStep: 24 }, 1000);
  const run = () => {
    const pending = frames.splice(0);
    time += 1000 / 60;
    pending.forEach((callback) => callback(time));
    return pending.length;
  };

  let told = 0;
  camera.subscribe(() => told++);
  let drawn = 0;
  camera.subscribeFrame(() => drawn++);

  check("idle camera schedules nothing", frames.length === 0);
  camera.panBy(10, 5);
  camera.panBy(10, 5);
  check("steps add up before a frame", camera.target.x === 20 && camera.target.y === 10);
  check("React is told at once, once per step", told === 2);
  check("only one frame is asked for", frames.length === 1);
  check("nothing is drawn before the frame", drawn === 0);
  run();
  check("the frame draws the sum", world.style.values.transform.includes(",20,10,0,1)"), world.style.values.transform);
  check("a hand move has no transition", world.style.values.transition === "");
  check("the scale is published for world-space labels", vars.style.values["--cam-s"] === "1");
  check("and not on the world, which holds the screens", world.style.values["--cam-s"] === undefined);
  check("a hand move leaves the camera idle", frames.length === 0 && drawn === 1);

  camera.set({ x: 100, y: 0, scale: 2 }, { glide: true });
  run();
  check("a glide sets the transition with the transform", world.style.values.transition === "world-glide" && grid.style.transition === "grid-glide");
  check("a glide isn't snapped or walked", world.style.values.transform.includes("matrix3d(2,0,0,0,0,2,0,0,0,0,1,0,100,0,0,1)"), world.style.values.transform);

  camera.set({ x: 300, y: 0, scale: 2 }, { ease: true });
  let steps = 0;
  while (frames.length && steps < 200) {
    run();
    steps++;
  }
  check("an eased move takes several frames", steps > 1 && steps < 200, `${steps}`);
  check("and arrives exactly", camera.current.x === 300 && camera.target.x === 300);
  check("then goes idle", frames.length === 0);
  check("each eased frame was drawn", drawn >= steps);

  const before = told;
  camera.set({ ...camera.target });
  check("setting the same place changes nothing", told === before && frames.length === 0);
}

if (failures.length) {
  console.log(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
