#!/usr/bin/env node
/** Checks the auto layout maths without a browser: node --no-warnings scripts/check-layout.mjs. Prints nothing when everything holds. */
import { detectLayout, flow, snapSpacing } from "../src/lib/canvas-layout.ts";

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const box = (id, x, y, width, height) => ({ id, x, y, width, height });

check("snaps to the scale", snapSpacing(23) === 24 && snapSpacing(5) === 4 && snapSpacing(0) === 0);
check("keeps a gap far from the scale", snapSpacing(150) === 150 || snapSpacing(150) === 144, String(snapSpacing(150)));

// Side by side: a row, the gap between them, top-aligned.
{
  const found = detectLayout([box("a", 0, 0, 100, 40), box("b", 124, 0, 80, 40), box("c", 228, 0, 60, 40)]);
  check("row", found.direction === "row" && found.gap === 24 && found.align === "start", JSON.stringify(found));
}
// Stacked, centred across.
{
  const found = detectLayout([box("a", 0, 0, 100, 40), box("b", 10, 52, 80, 40), box("c", 20, 104, 60, 40)]);
  check("column, centred", found.direction === "column" && found.gap === 12 && found.align === "center", JSON.stringify(found));
}
// Flowing puts them in the order they sit, and sizes the whole.
{
  const out = flow([box("b", 300, 0, 50, 20), box("a", 0, 5, 40, 30)], { direction: "row", gap: 8, align: "center", padding: 4 });
  check("order and gap", out.positions.a.x === 4 && out.positions.b.x === 52, JSON.stringify(out.positions));
  check("centred across", out.positions.a.y === 4 && out.positions.b.y === 9, JSON.stringify(out.positions));
  check("size", out.width === 4 + 40 + 8 + 50 + 4 && out.height === 38, `${out.width}x${out.height}`);
}

// Padding per side, and spreading along the direction.
{
  const out = flow([box("a", 0, 0, 40, 20), box("b", 60, 0, 40, 20)], { direction: "row", gap: 8, align: "start", padding: 4, paddingX: 10, paddingY: 2, justify: "between" }, { main: 200 });
  check("per-side padding", out.positions.a.x === 10 && out.positions.a.y === 2, JSON.stringify(out.positions));
  check("spreads to the ends", out.positions.b.x === 10 + 40 + (200 - 80) , JSON.stringify(out.positions));
}

if (failures.length) {
  console.log(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
