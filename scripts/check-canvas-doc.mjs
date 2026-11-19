#!/usr/bin/env node
/** Checks what a saved canvas may hold without a browser: node --no-warnings scripts/check-canvas-doc.mjs. Prints nothing when everything holds. */
import { applyPatch, canvasDocSchema, canvasPatchSchema, diffCanvas, IMAGE_DATA, IMAGE_NAME } from "../src/lib/canvas-doc.ts";

const failures = [];
const check = (name, ok, detail = "") => {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};

const good = { savedAt: "2026-11-19T10:00:00.000Z", canvas: { offsets: { "stage/piece-ab12cd": { x: 4, y: 8 } }, pieces: [{ id: "piece-ab12cd", story: "x", props: {} }], frames: [{ id: "frame-1", x: 0, y: 0, width: 100, height: 100 }] } };
check("a canvas is accepted", canvasDocSchema.safeParse(good).success);
check("an empty canvas is accepted", canvasDocSchema.safeParse({ savedAt: "now", canvas: { offsets: {}, pieces: [], frames: [] } }).success);
check("offsets must be numbers", !canvasDocSchema.safeParse({ ...good, canvas: { ...good.canvas, offsets: { a: { x: "1", y: 2 } } } }).success);
check("pieces must be a list", !canvasDocSchema.safeParse({ ...good, canvas: { ...good.canvas, pieces: {} } }).success);

check("a picture name is what the canvas makes", IMAGE_NAME.test("piece-ab12cd") && IMAGE_NAME.test("abc123"));
check("a picture name can't become another path", !IMAGE_NAME.test("../registry") && !IMAGE_NAME.test("a/b") && !IMAGE_NAME.test("ab"));
check("a PNG or JPEG data address", IMAGE_DATA.test("data:image/png;base64,iVBOR=") && IMAGE_DATA.test("data:image/jpeg;base64,/9j/4AAQ"));
check("nothing else is a picture", !IMAGE_DATA.test("data:text/html;base64,PGh0bWw+") && !IMAGE_DATA.test("data:image/svg+xml;base64,PHN2Zz4=") && !IMAGE_DATA.test("javascript:alert(1)"));

// What a save sends: only what changed, and merged into what the cloud holds.
{
  const item = (id, x = 0) => ({ id, x });
  const base = { offsets: { a: { x: 1, y: 1 } }, pieces: [item("p1"), item("p2")], frames: [item("f1")] };
  check("nothing changed, nothing sent", diffCanvas(base, { ...base }) === null);
  const moved = diffCanvas(base, { ...base, offsets: { a: { x: 5, y: 1 } } });
  check("a moved layer is one offset", JSON.stringify(moved) === JSON.stringify({ offsets: { set: { a: { x: 5, y: 1 } } } }), JSON.stringify(moved));
  const edited = diffCanvas(base, { ...base, pieces: [item("p1", 9), item("p2")] });
  check("only the changed layer is sent", edited?.pieces?.set && Object.keys(edited.pieces.set).join() === "p1" && !edited.pieces.order, JSON.stringify(edited));
  const removed = diffCanvas(base, { ...base, pieces: [item("p2")], frames: [] });
  check("removals are named", removed?.pieces?.remove?.join() === "p1" && removed?.frames?.remove?.join() === "f1", JSON.stringify(removed));
  const reordered = diffCanvas(base, { ...base, pieces: [item("p2"), item("p1")] });
  check("a new order is sent whole", reordered?.pieces?.order?.join() === "p2,p1" && !reordered.pieces.set, JSON.stringify(reordered));
  check("a patch is checked", canvasPatchSchema.safeParse(moved).success && !canvasPatchSchema.safeParse({ offsets: { set: { a: { x: "5" } } } }).success);

  // Merged into what somebody else has since saved: their layer stays, ours changes.
  const theirs = { ...base, pieces: [item("p1"), item("p2"), item("p3")] };
  const merged = applyPatch(theirs, diffCanvas(base, { ...base, pieces: [item("p1", 9), item("p2")] }));
  check("their layer is kept", merged.pieces.map((one) => one.id).join() === "p1,p2,p3" && merged.pieces[0].x === 9, JSON.stringify(merged.pieces));
  const gone = applyPatch(theirs, diffCanvas(base, { ...base, pieces: [item("p2")] }));
  check("our removal applies", gone.pieces.map((one) => one.id).join() === "p2,p3", JSON.stringify(gone.pieces));
  const order = applyPatch(theirs, diffCanvas(base, { ...base, pieces: [item("p2"), item("p1")] }));
  check("our order applies, theirs follows", order.pieces.map((one) => one.id).join() === "p2,p1,p3", JSON.stringify(order.pieces));
  check("applying twice changes nothing more", JSON.stringify(applyPatch(merged, diffCanvas(base, { ...base, pieces: [item("p1", 9), item("p2")] }))) === JSON.stringify(merged));
}

if (failures.length) {
  console.log(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
