import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A prototype's copy document, built from its words with no model reading anything (see `registry/copy-docs.ts`): the lines of words in
 * `src/lib/copy.ts`, grouped into sections, as the Markdown of a document with a table for each.
 */

export type Entry = { key: string; value: string; what: string; /** Its number among every string in the copy object (empty ones and the images' too), which is the number its tag in the page spells in development. */ index: number; /** Where the string stands in the file (its quotes included), so it can be replaced. */ at: [number, number] };
export type Group = {
  name: string;
  blurb: string;
  entries: Entry[];
  /** A few of the section's lines that are in no other section, spread from its first to its last: a link to the section on the canvas finds the section in the page by them. */
  find: string[];
};

/** "headlineTagline" as "Headline tagline". */
const words = (name: string) => {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2").replace(/[-_.]+/g, " ").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * Every line of words in `src/lib/copy.ts`, in the order the file has them, with where each sits (its key: the names it is under, joined by dots, and a
 * number for a place in a list) and what it is: the comment written above it in the file, when there is one, and otherwise its name in words.
 * A comment above a whole group is what that section says about itself. The "images" group holds addresses, not words, and is left out.
 */
export async function readCopy(folder: string): Promise<Group[]> {
  const text = await readFile(join(folder, "src", "lib", "copy.ts"), "utf8").catch(() => {
    throw new Error("This prototype keeps no src/lib/copy.ts, so there are no words to put in a document.");
  });
  return parseCopy(text);
}

/** The same, from the text of the file. */
export async function parseCopy(text: string): Promise<Group[]> {
  const ts = await import("typescript");
  const source = ts.createSourceFile("copy.ts", text, ts.ScriptTarget.Latest, true);

  const commentAbove = (node: import("typescript").Node) => {
    const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
    const last = ranges[ranges.length - 1];
    if (!last) return "";
    return text
      .slice(last.pos, last.end)
      .replace(/^\/\*+|\*+\/$/g, "")
      .split("\n")
      .map((line) => line.replace(/^\s*(\/\/+|\*+)\s?/, "").trim())
      .filter(Boolean)
      .join(" ");
  };
  const nameOf = (name: import("typescript").PropertyName) => (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : name.getText(source));
  /** The value of an expression that is only words: a string, or one wrapped in `as const`, a parenthesis or a call such as tagged("…"). */
  const stringOf = (node: import("typescript").Expression): string | null => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return stringOf(node.expression);
    return null;
  };

  const unwrap = (node: import("typescript").Expression): import("typescript").Expression => (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node) ? unwrap(node.expression) : ts.isCallExpression(node) && node.arguments[0] ? unwrap(node.arguments[0]) : node);
  const groups: Group[] = [];
  let counted = 0;
  const walk = (node: import("typescript").Expression, path: string[], what: string, group: Group) => {
    const value = stringOf(node);
    if (value !== null) {
      const index = counted++;
      if (value.trim()) group.entries.push({ key: path.join("."), index, at: [node.getStart(source), node.getEnd()], value, what: what || words(path.slice(1).map((one) => (/^\d+$/.test(one) ? `${Number(one) + 1}` : one)).join(" ") || path[0]) });
      return;
    }
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return walk(node.expression, path, what, group);
    // tagged({ … }): the object is its first argument.
    if (ts.isCallExpression(node) && node.arguments[0]) return walk(node.arguments[0], path, what, group);
    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        walk(property.initializer, [...path, nameOf(property.name)], commentAbove(property), group);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((element, index) => walk(element, [...path, String(index)], commentAbove(element) || (path.length ? `${words(path[path.length - 1])} ${index + 1}` : ""), group));
    }
  };

  let found = false;
  source.forEachChild((statement) => {
    if (!ts.isVariableStatement(statement)) return;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isIdentifier(declaration.name) || declaration.name.text !== "COPY") continue;
      found = true;
      let object: import("typescript").Expression = declaration.initializer;
      while (!ts.isObjectLiteralExpression(object)) {
        if (ts.isCallExpression(object) && object.arguments[0]) object = object.arguments[0];
        else if (ts.isAsExpression(object) || ts.isParenthesizedExpression(object) || ts.isSatisfiesExpression(object)) object = object.expression;
        else return;
      }
      for (const property of object.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name = nameOf(property.name);
        if (name === "images") {
          // Not words, but still counted: a line's number is its place among every string.
          walk(property.initializer, [name], "", { name, blurb: "", entries: [], find: [] });
          continue;
        }
        // A group made only of groups (every bundle under "bundle") is a section for each of them.
        const inner = unwrap(property.initializer);
        const parts = ts.isObjectLiteralExpression(inner) && inner.properties.length > 1 && inner.properties.every((one) => ts.isPropertyAssignment(one) && ts.isObjectLiteralExpression(unwrap(one.initializer))) ? (inner.properties as unknown as import("typescript").PropertyAssignment[]) : null;
        if (parts) {
          for (const part of parts) {
            const sub = nameOf(part.name);
            const group: Group = { name: words(`${name} ${sub}`), blurb: commentAbove(part) || commentAbove(property), entries: [], find: [] };
            walk(part.initializer, [name, sub], "", group);
            if (group.entries.length) groups.push(group);
          }
          continue;
        }
        const group: Group = { name: words(name), blurb: commentAbove(property), entries: [], find: [] };
        walk(property.initializer, [name], "", group);
        if (group.entries.length) groups.push(group);
      }
    }
  });
  // Each section's anchors: lines that occur once in the whole file (the same words elsewhere would point at the wrong place), long enough to be found,
  // the first, the last and the longest between them, each cut to what is still unmistakable.
  const count = new Map<string, number>();
  for (const group of groups) for (const entry of group.entries) count.set(entry.value.trim(), (count.get(entry.value.trim()) ?? 0) + 1);
  for (const group of groups) {
    const once = group.entries.filter((entry) => entry.value.trim().length >= 12 && count.get(entry.value.trim()) === 1);
    const longest = [...once].sort((a, b) => b.value.length - a.value.length)[0];
    group.find = [...new Set([once[0], longest, once[once.length - 1]].filter(Boolean).map((entry) => entry!.value.trim().replace(/\s+/g, " ").slice(0, 48)))];
  }
  if (!found || !groups.length) throw new Error("There are no words in src/lib/copy.ts to put in a document (it should hold them in an object called COPY).");
  return groups;
}

/** A line as it reads in a table cell: on one line. */
export const cellText = (value: string) => value.replace(/\r?\n/g, " ").trim();
const cell = (value: string) => value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
const keyCell = (key: string) => `\`${key}\``;

/** The same sections for both places; only the columns' names differ. In Notion it goes into the page it is given, so it starts with its own heading. */
export function copyMarkdown(groups: Group[], kind: "claude" | "notion", name: string, link?: (group: Group) => string | null) {
  const { head, body } = copyParts(groups, kind, name, link);
  return `${head}\n${body}`;
}

/** The block a Status cell stands for in the Claude doc: one dropdown chip (the doc makes one for each place the token is written; see `claudePrompt`). */
export const STATUS_TOKEN = "<?claude block st?>";

/**
 * The document in two parts, the heading lines and the sections, because the Claude doc is made in two steps: its Status dropdown has to exist before
 * the table that holds it. In the Claude doc each Status cell is the dropdown's token; it starts as Draft, and only a line set to Approved is taken back.
 */
export function copyParts(groups: Group[], kind: "claude" | "notion", name: string, link?: (group: Group) => string | null) {
  const columns = kind === "claude" ? ["What", "Key", "Current English", "Suggested English", "German", "Status"] : ["Element", "Key", "EN copy", "EN New", "DE"];
  const blank = columns.slice(3).map((column) => (column === "Status" ? STATUS_TOKEN : ""));
  const head: string[] = [`# ${name} copy`, ""];
  if (kind === "claude") head.push(new Date().toISOString().slice(0, 10), "", "Leave Suggested English empty, or write /, when a line needs no change. Set Status to Approved when a line is final: only those are taken back into the prototype.", "");
  const body: string[] = [];
  groups.forEach((group, index) => {
    body.push(`## ${index + 1}. ${group.name}`, "");
    // Where the section is: a link into the studio's canvas, zoomed to it, in place of a description.
    const where = link?.(group);
    if (where) body.push(`[Open on the canvas](${where})`, "");
    body.push(`| ${columns.join(" | ")} |`, `| ${columns.map(() => "---").join(" | ")} |`);
    for (const entry of group.entries) body.push(`| ${[cell(entry.what), keyCell(entry.key), cell(entry.value), ...blank].join(" | ")} |`);
    body.push("");
  });
  return { head: head.join("\n"), body: body.join("\n") };
}

/**
 * `text` (the file) with each line of words in `changes` replaced by its new words, found by key. A line is only replaced if it still says what
 * the change was made from, so words that were changed meanwhile are never overwritten; those are given back as skipped.
 */
export async function replaceCopy(text: string, changes: { key: string; before: string; after: string }[]) {
  const entries = (await parseCopy(text)).flatMap((group) => group.entries);
  const found = new Map(entries.map((entry) => [entry.key, entry]));
  const applied: string[] = [];
  const skipped: { key: string; why: string }[] = [];
  const edits: { at: [number, number]; with: string }[] = [];
  for (const change of changes) {
    const entry = found.get(change.key);
    if (!entry) skipped.push({ key: change.key, why: "It isn't in the file any more." });
    else if (entry.value !== change.before) skipped.push({ key: change.key, why: "It was changed in the file meanwhile." });
    else {
      edits.push({ at: entry.at, with: JSON.stringify(change.after).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") });
      applied.push(change.key);
    }
  }
  let next = text;
  for (const edit of edits.sort((a, b) => b.at[0] - a.at[0])) next = next.slice(0, edit.at[0]) + edit.with + next.slice(edit.at[1]);
  return { text: next, applied, skipped };
}
