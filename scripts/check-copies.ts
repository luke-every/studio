// A runnable check of how the canvas lays out several devices' copies of each screen (src/lib/flow.ts): each screen's
// copies side by side where the screen stands, how big the whole is, how it is fitted, and how far the view follows
// when a device is switched on or off. Run from the studio's folder:
//   npx tsx scripts/check-copies.ts
import assert from "node:assert/strict";
import { copyKey, fitView, followShift, layoutFlow, screenOfCopy, spreadCopies, type Flow } from "@/lib/flow";

const flow: Flow = {
  screens: [
    { id: "home", name: "Home", params: {} },
    { id: "a/b", name: "Detail", params: {} },
    { id: "done", name: "Done", params: {} },
  ],
  edges: [
    { from: "home", to: "a/b" },
    { from: "a/b", to: "done" },
  ],
};
const phone = { id: "phone", width: 200 };
const desktop = { id: "desktop", width: 700 };
const GAP = 100;
const BETWEEN = 50;
// As the canvas does it: a screen's place is as wide as all its copies and the gaps between them.
const lay = (devices: { id: string; width: number }[]) => {
  const group = devices.reduce((sum, device) => sum + device.width, 0) + BETWEEN * (devices.length - 1);
  const laid = layoutFlow(flow, { width: group + GAP, height: 500 });
  return { placed: spreadCopies(laid.placed, devices, BETWEEN), width: laid.width - GAP, height: laid.height };
};

// One device is the layout as it was, under copies' keys.
const one = lay([phone]);
assert.deepEqual([one.width, one.height], [800, 500]);
assert.deepEqual(one.placed.get(copyKey("phone", "a/b")), { x: 300, y: 0 });

// Two: each screen's copies side by side, the second after the first and the gap between; the next screen after both.
const two = lay([phone, desktop]);
assert.equal(two.placed.size, 6, "a place for every copy");
assert.deepEqual(two.placed.get(copyKey("phone", "home")), { x: 0, y: 0 });
assert.deepEqual(two.placed.get(copyKey("desktop", "home")), { x: 250, y: 0 });
assert.deepEqual(two.placed.get(copyKey("phone", "a/b")), { x: 1050, y: 0 });
assert.deepEqual(two.placed.get(copyKey("desktop", "done")), { x: 2350, y: 0 });
assert.equal(two.width, 3 * 950 + 2 * GAP);

// A copy's key gives its screen back, slash and all.
assert.equal(screenOfCopy(copyKey("desktop", "a/b")), "a/b");

// Fitting: as tall as the room, running on past the right edge from the left inset; centred when it all fits.
const inset = { top: 100, side: 50 };
const room = { width: 1000, height: 700 };
assert.deepEqual(fitView({ width: 5000, height: 1100 }, room, inset, 0.08), { scale: 0.5, x: 50, y: 100 });
assert.deepEqual(fitView({ width: 900, height: 1100 }, room, inset, 0.08), { scale: 0.5, x: (1000 - 450) / 2, y: 100 });
// Never bigger than life, never smaller than the least.
assert.equal(fitView({ width: 100, height: 100 }, room, inset, 0.08).scale, 1);
assert.equal(fitView({ width: 100, height: 100000 }, room, inset, 0.08).scale, 0.08);

// The view follows the copy nearest its middle. Looking at the phone's Detail when the desktop is switched on: it went 750 along.
assert.deepEqual(followShift(one.placed, two.placed, { x: 320, y: 10 }), { x: 750, y: 0 });
// Looking at the first screen: nothing moved.
assert.deepEqual(followShift(one.placed, two.placed, { x: 10, y: 10 }), { x: 0, y: 0 });
// Switched off again while looking at the desktop's Detail (gone): the nearest that is left is the phone's Detail, which comes back 750.
assert.deepEqual(followShift(two.placed, one.placed, { x: 1400, y: 0 }), { x: -750, y: 0 });
// Nothing in common, nothing to follow.
assert.deepEqual(followShift(one.placed, lay([desktop]).placed, { x: 0, y: 0 }), { x: 0, y: 0 });

console.log("ok: copies");
