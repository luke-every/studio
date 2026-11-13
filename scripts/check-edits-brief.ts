// A runnable check of how edits made by hand on a live version are put in words for Claude (`editsBrief` in
// src/lib/edits.ts): each element once, each change from what to what, and nothing that isn't an edit.
//   npx tsx scripts/check-edits-brief.ts
import assert from "node:assert/strict";

import { editChangesSchema, editsBrief, type EditChange } from "../src/lib/edits";

const changes: EditChange[] = [
  { edit: { kind: "text", selector: "body > main > h1", text: "Welcome\nback" }, tag: "h1", words: "Hello" },
  { edit: { kind: "style", selector: "body > main > h1", css: { color: "#ff0000", "font-size": "40px" } }, tag: "h1", words: "Hello", from: { color: "rgb(0, 0, 0)", "font-size": "32px" } },
  { edit: { kind: "style", selector: "#cta", css: { border: "1px solid red" } }, tag: "button" },
];
const brief = editsBrief(changes, { screen: "/pricing", setup: "variant=b" });

assert.equal(brief.match(/^\d+\. /gm)?.length, 2, "one item an element, however many edits it has");
assert.ok(brief.includes('1. <h1> that says "Hello"\n   - Element: body > main > h1'));
assert.ok(brief.includes('   - Words: "Hello" → "Welcome\\nback"'), "old and new words, a line break kept as one");
assert.ok(brief.includes("   - color: rgb(0, 0, 0) → #ff0000") && brief.includes("   - font-size: 32px → 40px"), "each property from what to what");
assert.ok(brief.includes("2. <button>\n   - Element: #cta\n   - border: 1px solid red"), "a property whose old value isn't known says only the new one");
assert.ok(brief.includes("Page: /pricing (setup: ?variant=b)"));
assert.ok(/Never as an inline style/.test(brief) && /Change only what is listed/.test(brief));
assert.ok(!editsBrief(changes).includes("Page:"), "no page line when it isn't known");

// What the server accepts: the same shapes as a saved edit, and nothing that could be more than a value.
assert.ok(editChangesSchema.safeParse(changes).success);
assert.ok(!editChangesSchema.safeParse([]).success, "nothing to apply is refused");
assert.ok(!editChangesSchema.safeParse([{ edit: { kind: "style", selector: "p", css: { color: "red; } body { display: none" } } }]).success, "a value that would close the rule is refused");
console.log("ok: edits brief");
