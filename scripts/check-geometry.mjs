#!/usr/bin/env node
/**
 * Checks the canvas's alignment and measuring maths without a browser (Node runs the TypeScript directly):
 *
 *   node scripts/check-geometry.mjs
 *
 * Prints nothing when everything holds, and the failures when something doesn't.
 */
import { measure, snapMove } from "../src/lib/canvas-geometry.ts";

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const rect = (id, x, y, width, height) => ({ id, x, y, width, height });

// Near a target's edge it snaps to it; far, it doesn't.
{
  const target = rect("t", 100, 0, 50, 50);
  const near = snapMove(rect("m", 103, 200, 200, 40), [target], 4);
  check("snaps a start to a start", near.dx === -3, JSON.stringify(near));
  const far = snapMove(rect("m", 110, 200, 200, 40), [target], 4);
  check("does not snap beyond the threshold", far.dx === 0 && far.guides.length === 0, JSON.stringify(far));
}

// The middle snaps too, and the nearest of several wins.
{
  const target = rect("t", 100, 0, 100, 50); // stops 100, 150, 200
  const result = snapMove(rect("m", 131, 200, 40, 40), [target], 4); // middle 151 -> 150
  check("snaps a middle to a middle", result.dx === -1, JSON.stringify(result));
}

// Axes are independent: snaps across to one thing and down to another.
{
  const a = rect("a", 100, 500, 10, 10);
  const b = rect("b", 900, 50, 10, 10);
  const result = snapMove(rect("m", 102, 52, 20, 20), [a, b], 4);
  check("each axis snaps on its own", result.dx === -2 && result.dy === -2, JSON.stringify(result));
}

// A guide runs along the alignment and spans both rectangles; none where nothing lines up.
{
  const target = rect("t", 100, 0, 50, 50);
  const { guides } = snapMove(rect("m", 100, 200, 40, 40), [target], 4);
  const edge = guides.find((g) => g.axis === "x" && g.at === 100);
  check("a guide is drawn on the alignment", !!edge && edge.from === 0 && edge.to === 240, JSON.stringify(guides));
  check("no guide where nothing lines up", snapMove(rect("m", 500, 500, 10, 10), [target], 4).guides.length === 0);
}

// Several stops on one line make one guide.
{
  const result = snapMove(rect("m", 100, 100, 100, 100), [rect("t", 100, 0, 100, 50)], 4);
  const lines = result.guides.filter((g) => g.axis === "x" && g.at === 100);
  check("one guide per line", lines.length === 1, JSON.stringify(result.guides));
}

// Measuring: apart, inside, crossing.
{
  const gap = measure(rect("a", 0, 0, 50, 50), rect("b", 74, 10, 50, 30));
  const across = gap.find((s) => s.y1 === s.y2);
  check("measures the gap between facing edges", across && across.length === 24 && across.x1 === 50 && across.x2 === 74, JSON.stringify(gap));
  check("the span sits in the middle of the overlap", across && across.y1 === 25, JSON.stringify(gap));

  const inside = measure(rect("a", 20, 30, 40, 40), rect("b", 0, 0, 100, 100));
  const lengths = inside.map((s) => s.length).sort((x, y) => x - y);
  check("measures the room round something inside", JSON.stringify(lengths) === JSON.stringify([20, 30, 40, 30].sort((x, y) => x - y)) || JSON.stringify(lengths) === JSON.stringify([20, 30, 30, 40]), JSON.stringify(inside));
  check("four sides when inside", inside.length === 4, JSON.stringify(inside));

  const touching = measure(rect("a", 0, 0, 50, 50), rect("b", 50, 0, 50, 50));
  check("no span where edges touch", !touching.some((s) => s.y1 === s.y2 && s.length === 0));

  const apart = measure(rect("a", 0, 0, 20, 20), rect("b", 100, 100, 20, 20));
  check("two spans when apart on both axes", apart.length === 2 && apart.every((s) => s.length === 80), JSON.stringify(apart));
}

if (failures.length) {
  console.log(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
