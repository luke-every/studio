#!/usr/bin/env node
/** Checks what a saved canvas may hold without a browser: node --no-warnings scripts/check-canvas-doc.mjs. Prints nothing when everything holds. */
import { canvasDocSchema, IMAGE_DATA, IMAGE_NAME } from "../src/lib/canvas-doc.ts";

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

if (failures.length) {
  console.log(failures.map((failure) => `FAIL ${failure}`).join("\n"));
  process.exit(1);
}
