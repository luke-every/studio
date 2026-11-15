// A runnable check of /handoff's scanner (.claude/skills/handoff/scan.mjs): the colour maths on known values, then a
// read-only scan of the worked example, bundle-comparison, with its final variants A, B and PDP, printed for a person to
// read. Nothing is written into the prototype and nothing is sent to the studio. Run from the studio's folder:
//   node scripts/check-handoff.mjs [path to bundle-comparison]
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";

import { deltaE, exactFixes, parseColour, parseTokens, printSummary, scan, toHex } from "../.claude/skills/handoff/scan.mjs";

// Colours: written several ways, read the same.
assert.deepEqual(parseColour("#EEEAE6"), { r: 238, g: 234, b: 230, a: 1 });
assert.deepEqual(parseColour("#fff"), { r: 255, g: 255, b: 255, a: 1 });
assert.deepEqual(parseColour("rgba(55, 45, 39, 0.06)"), { r: 55, g: 45, b: 39, a: 0.06 });
assert.deepEqual(parseColour("rgb(55 45 39 / 50%)"), { r: 55, g: 45, b: 39, a: 0.5 });
assert.equal(toHex(parseColour("#EEEAE6")), "#eeeae6");
assert.equal(deltaE(parseColour("#eeeae6"), parseColour("#EEEAE6")), 0);
assert.ok(deltaE(parseColour("#eeeae6"), parseColour("#efeae5")) < 2, "two near greys are near");
assert.ok(deltaE(parseColour("#ff7d34"), parseColour("#372d27")) > 50, "orange is not dark brown");
// Tokens: the @theme inline block, with a var() resolved from :root.
const tokens = parseTokens(":root { --background: #ffffff; }\n@theme inline {\n  --color-background: var(--background);\n  --color-dark: #372d27;\n  --font-sans: x;\n}");
assert.deepEqual(tokens.map((token) => [token.name, token.value]), [["background", "#ffffff"], ["dark", "#372d27"], ["black", "#000000"], ["white", "#ffffff"]]);

// Exact colours: only a colour class in the prototype's own files is swapped for the token, keeping its opacity.
const exact = (where, mine = { hex: "#bdb3a9", alpha: 1, value: "#bdb3a9", written: ["#bdb3a9"] }, token = "light-grey-3") => ({ rule: "colours", tier: "exact", mine, where, candidates: [{ name: token }] });
const fixes = exactFixes({
  scope: { live: [{ file: "own.tsx", role: "new" }, { file: "copy.tsx", role: "stand-in" }] },
  findings: [
    exact([{ file: "own.tsx", line: 3, selector: "hover:border-[#bdb3a9]" }, { file: "copy.tsx", line: 4, selector: "border-[#bdb3a9]" }, { file: "own.tsx", line: 9, selector: "stroke" }]),
    exact([{ file: "own.tsx", line: 5, selector: "bg-[#000]/50" }], { hex: "#000000", alpha: 1, value: "#000000", written: ["#000"] }, "black"),
    exact([{ file: "own.tsx", line: 6, selector: "bg-[rgba(0,0,0,0.25)]" }], { hex: "#000000", alpha: 0.25, value: "#000000/25", written: ["rgba(0,0,0,0.25)"] }, "black/25"),
    { ...exact([{ file: "own.tsx", line: 7, selector: "bg-[#bdb3a8]" }]), tier: "near" },
  ],
});
assert.deepEqual(fixes.fixes.map((fix) => `${fix.line} ${fix.from} -> ${fix.to}`), ["3 hover:border-[#bdb3a9] -> hover:border-light-grey-3", "5 bg-[#000]/50 -> bg-black/50", "6 bg-[rgba(0,0,0,0.25)] -> bg-black/25"]);
assert.deepEqual(fixes.left.map((item) => `${item.file}:${item.line} ${item.why}`), ["copy.tsx:4 in a file copied from production", "own.tsx:9 not written as a colour class"]);

// The worked example, read-only.
const dir = process.argv[2] ?? join(homedir(), "Claude", "prototypes", "bundle-comparison");
const site = "src/components/website";
const comparison = `${site}/comparison`;
const chrome = [`${site}/HeaderV2.tsx`, `${site}/Footer.tsx`];
const result = scan({
  dir,
  by: "check",
  variants: [
    { id: "a", entries: [`${comparison}/BundleOverview.tsx`, `${comparison}/BundleMenuRows.tsx`, ...chrome] },
    { id: "b", entries: [`${comparison}/BundleOverview.tsx`, `${comparison}/BundleMenuRows.tsx`, ...chrome] },
    { id: "i", entries: [`${comparison}/BundleComparisonF.tsx`, `${site}/HeaderV2.tsx`] },
  ],
});
printSummary(result);

const kinds = (kind) => result.findings.filter((finding) => finding.kind === kind).map((finding) => finding.mine.name ?? finding.mine.value);
assert.ok(kinds("near-match").includes("OverviewCard") && result.findings.some((finding) => finding.id.endsWith(":MacroStat")), "the macro tiles re-implement MacroStat");
for (const name of ["Collapse", "CompareSheet", "CtaCard"]) assert.ok(kinds("new-reusable").includes(name), `${name} is new and reusable`);
// Files that came with the prototype from a kit, untouched, aren't the designer's to decide: listed for engineering, not reviewed.
for (const name of ["HeaderV2", "Footer", "BundleBoxCard"]) assert.ok(result.kit.some((item) => item.name === name) && !kinds("stand-in").includes(name), `${name} came from a kit`);
// One the designer changed after it came is still a stand-in, reviewed.
for (const name of ["DesktopNav", "MobileNavDrawer"]) assert.ok(kinds("stand-in").includes(name), `${name} was changed from the kit's, so it is a stand-in`);
for (const name of ["BundleCardA.tsx", "CompareCard.tsx", "BundleStack.tsx", "MealThumb.tsx"]) assert.ok(result.scope.dropped.some((file) => file.endsWith(`/${name}`)), `${name} is not handed off`);
assert.ok(result.findings.every((finding) => finding.decision === null && finding.where.length > 0));
// What the studio needs to draw them: how to find mine in the page, the match compiled, the prototype's look.
const tag = result.findings.find((finding) => finding.id.endsWith("OverviewCard.tsx:Tag"));
assert.deepEqual(tag.mine.find, { tag: "span", classes: tag.mine.classes }, "the tag is found by its own classes");
assert.ok(/exports\.Tag = Tag/.test(tag.candidates[0].module) && /createElement/.test(tag.candidates[0].module), "Tag is compiled to draw");
assert.ok(result.findings.filter((finding) => finding.kind === "stand-in").every((finding) => !finding.candidates[0].module), "production's own components read its data, so none is drawn");
assert.equal(result.findings.find((finding) => finding.mine.name === "OverviewCard" && finding.kind === "feature-only").mine.find.tag, "article", "an element is found by its tag");
assert.ok(result.theme.css.includes("@theme") && !/@import/.test(result.theme.css) && result.theme.fonts.some((font) => font.variable === "--font-diatype"));
// What /push and /handoffpush compare against, to say what changed after the handoff was made; and how kit parts are found in a page.
assert.ok(result.scope.hashes && result.scope.live.every((item) => /^[0-9a-f]{40}$/.test(result.scope.hashes[item.file] ?? "")), "every live file has a hash");
assert.ok(result.kit.every((item) => !item.find || Array.isArray(item.find.classes)), "a kit part can be found by its classes");
// What an element picked in the page is matched to: the lines of the prototype's own components, by tag, classes and words.
assert.ok(Object.values(result.scope.elements).flat().length > 50 && Object.values(result.scope.elements).flat().every((row) => row.length === 5 && row[0] <= row[1]), "the elements are indexed by line");
console.log("\nok: handoff scanner");
