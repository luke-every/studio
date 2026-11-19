// Checks the copy import: reading a pasted table, weighing it against the file, and replacing the lines. Run: node --experimental-strip-types --no-warnings scripts/check-copy-import.mjs
import assert from "node:assert/strict";
import { parseCopyPaste, reviewCopy, rowsFromTable } from "../src/lib/copy-import.ts";
import { copyMarkdown, parseCopy, replaceCopy } from "../src/lib/copy-doc-build.ts";
import { tablesFromDocXml } from "../src/lib/doc-xml.ts";

const file = `import { tagged } from "@/lib/studio-copy";
export const COPY = tagged({
  hero: {
    // The heading
    headline: "Eat well.",
    cta: "From {price} /meal",
    bullets: ["One", "Two"],
  },
  images: { hero: "/img/a.png" },
});
`;
const groups = await parseCopy(file);
assert.deepEqual(groups.flatMap((g) => g.entries.map((e) => e.key)), ["hero.headline", "hero.cta", "hero.bullets.0", "hero.bullets.1"]);
assert.equal(groups[0].entries[0].what, "The heading");
assert.ok(copyMarkdown(groups, "claude", "T").includes("| <?claude block st?> |"));
assert.ok(!copyMarkdown(groups, "notion", "T").includes("<?claude"));

const pasted = `## 1. Hero
| What | Key | Current English | Suggested English | German | Status |
| --- | --- | --- | --- | --- | --- |
| The heading | \`hero.headline\` | Eat well. | Eat better. |  | Approved |
| Label | \`hero.cta\` | From {price} /meal | From €5 /meal |  | approved |
| One | \`hero.bullets.0\` | One | / |  | Approved |
| Two | \`hero.bullets.1\` | Two | Deux |  | Draft |
| Gone | \`hero.nope\` | x | y |  | Approved |
`;
const rows = parseCopyPaste("", pasted);
assert.equal(rows.length, 5);
assert.equal(rows[0].section, "Hero");
const words = new Map(groups.flatMap((g) => g.entries.map((e) => [e.key, e.value])));
const review = reviewCopy(rows, words);
const kinds = Object.fromEntries(review.items.map((i) => [i.key, i.kind]));
assert.deepEqual(kinds, { "hero.headline": "ready", "hero.cta": "placeholders", "hero.bullets.0": "nocopy", "hero.bullets.1": "waiting", "hero.nope": "unknown" });
assert.equal(review.unknown, 1);

const done = await replaceCopy(file, [{ key: "hero.headline", before: "Eat well.", after: 'Eat "better".' }, { key: "hero.bullets.1", before: "Wrong", after: "Zwei" }]);
assert.deepEqual(done.applied, ["hero.headline"]);
assert.equal(done.skipped[0].key, "hero.bullets.1");
assert.ok(done.text.includes('headline: "Eat \\"better\\"."'));
assert.ok(done.text.includes('images: { hero: "/img/a.png" }'));
// A doc as the connector gives it: tables of paragraphs, with words in several pieces, code spans and a dropdown chip for the status.
const xml = `<doc node='525e' rev='3'><paragraph id='a.0' heading='1'>Bundle copy</paragraph><paragraph id='.27' heading='2'><text id='.28'>1. Hero &amp; intro</text></paragraph><table id='.35'><row id='.36'><cell header='true'><paragraph id='.37'><text id='.38'>What</text></paragraph></cell><cell header='true'><paragraph><text>Key</text></paragraph></cell><cell header='true'><paragraph><text>Current English</text></paragraph></cell><cell header='true'><paragraph><text>Suggested English</text></paragraph></cell><cell header='true'><paragraph><text>German</text></paragraph></cell><cell header='true'><paragraph><text>Status</text></paragraph></cell></row><row id='.100'><cell><paragraph><text>Heading</text></paragraph></cell><cell><paragraph><text><code>hero.headline</code></text></paragraph></cell><cell><paragraph><text>Eat well</text><text>, every day</text><text>.</text></paragraph></cell><cell><paragraph><text>Eat better, &quot;daily&quot;.</text></paragraph></cell><cell><paragraph/></cell><cell><paragraph><dropdown id='.151' enum='x' index='2'>Approved</dropdown></paragraph></cell></row><row id='.101'><cell><paragraph><text>Label</text></paragraph></cell><cell><paragraph><text><code>hero.cta</code></text></paragraph></cell><cell><paragraph><text>Go</text></paragraph></cell><cell><paragraph><text>/</text></paragraph></cell><cell><paragraph/></cell><cell><paragraph><dropdown id='.152' enum='x' index='0'>Draft</dropdown></paragraph></cell></row></table></doc>`;
const fromDoc = tablesFromDocXml(xml).flatMap((table) => rowsFromTable(table.lines, table.section));
assert.equal(fromDoc.length, 2);
assert.deepEqual(fromDoc[0], { key: "hero.headline", current: "Eat well, every day.", next: 'Eat better, "daily".', status: "Approved", section: "Hero & intro" });
assert.equal(fromDoc[1].next, "/");
assert.equal(fromDoc[1].status, "Draft");
console.log("copy import checks passed");
