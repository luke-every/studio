import { readFile, rename, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import type { Edit } from "@/lib/edits";
import { restyle, showsFrom, type Colour } from "@/lib/tailwind-classes";

/**
 * Writes the changes made on the canvas into the project's own files, on this machine, as a developer would: a change of style is a change to that element's
 * Tailwind classes, a change of words is the words in the file. Each edit carries `loc`, the place in the file its element was written (file, line, column), put on
 * the element while the page is built (see `scripts/studio-loc-loader.cjs`), so the element is found exactly. Only files under the project's own `src` are written:
 * production's files, which the project imports, are never tagged, so they are never found, and never changed.
 */
export type SourceWrite = { saved: string[]; where: string[]; left: { selector: string; why: string }[]; /** The files written, as they were and as they became (paths from the project's folder): what undo puts back. */ touched: { path: string; before: string; after: string }[] };

type Change = { start: number; end: number; text: string };

export async function writeSourceEdits(folder: string, edits: Edit[], colours: Colour[]): Promise<SourceWrite> {
  const result: SourceWrite = { saved: [], where: [], left: [], touched: [] };
  const skip = (selector: string, why: string) => result.left.push({ selector, why });
  const ts = (await import("typescript")).default;
  const own = resolve(folder, "src");

  // By file, then element: the later change of the same property wins.
  type Entry = { removals: { line: number; col: number; selector: string; expect?: string }[]; styles: Map<string, { line: number; col: number; css: Record<string, string>; selectors: string[]; at?: number }>; texts: { line: number; col: number; edit: Edit & { kind: "text" } }[] };
  const files = new Map<string, Entry>();
  for (const edit of edits) {
    if (edit.kind !== "style" && edit.kind !== "text") {
      skip(edit.selector, "Only changes of style and words are written to a copy so far.");
      continue;
    }
    const found = edit.loc ? /^(.+):(\d+):(\d+)$/.exec(edit.loc) : null;
    if (!found) {
      skip(edit.selector, "This element isn't tagged with its place in the copy's file yet. Restart the project's server, then pick it again.");
      continue;
    }
    const path = resolve(folder, found[1]);
    if (!path.startsWith(own + sep) || !path.endsWith(".tsx")) {
      skip(edit.selector, "That isn't one of this project's own files.");
      continue;
    }
    // A change made on a fork is for the fork's own files. What it draws of other components (a nested section, a button) is the original, shared with the rest of the
    // prototype: it is not the fork's to change, however it looks on the canvas.
    if (edit.page?.startsWith("fork:") && !path.startsWith(resolve(folder, "src", "components", "forks") + sep)) {
      skip(edit.selector, `That part is in ${found[1]}, an original this fork uses but doesn't own: it is shared with the rest of the prototype, so it wasn't changed. Fork it to change a copy.`);
      continue;
    }
    const entry: Entry = files.get(path) ?? { removals: [], styles: new Map(), texts: [] };
    files.set(path, entry);
    const [line, col] = [Number(found[2]), Number(found[3])];
    if (edit.kind === "style" && edit.remove) {
      entry.removals.push({ line, col, selector: edit.selector, expect: edit.expect });
    } else if (edit.kind === "style") {
      const key = `${line}:${col}:${showsFrom(edit.at)}`;
      const at = entry.styles.get(key) ?? { line, col, css: {}, selectors: [], at: edit.at };
      Object.assign(at.css, edit.css);
      at.selectors.push(edit.selector);
      entry.styles.set(key, at);
    } else if (edit.kind === "text") {
      entry.texts.push({ line, col, edit });
    }
  }

  for (const [path, { styles, texts, removals }] of files) {
    const source = await readFile(path, "utf8").catch(() => null);
    const label = path.slice(own.length - "src".length);
    if (source === null) {
      for (const { selectors } of styles.values()) selectors.forEach((selector) => skip(selector, `${label} isn't there any more.`));
      for (const { edit } of texts) skip(edit.selector, `${label} isn't there any more.`);
      continue;
    }
    const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const elementAt = (line: number, col: number) => {
      let found: import("typescript").JsxOpeningElement | import("typescript").JsxSelfClosingElement | null = null;
      const visit = (node: import("typescript").Node) => {
        if (found) return;
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const at = sf.getLineAndCharacterOfPosition(node.tagName.getStart(sf));
          if (at.line + 1 === line && at.character + 1 === col) found = node;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      return found as import("typescript").JsxOpeningElement | import("typescript").JsxSelfClosingElement | null;
    };

    const changes: Change[] = [];
    const wrote: string[] = [];
    for (const { line, col, css, selectors, at } of styles.values()) {
      const element = elementAt(line, col);
      if (!element) {
        selectors.forEach((selector) => skip(selector, `Nothing is at ${line}:${col} of ${label} any more: the file has changed since the page loaded.`));
        continue;
      }
      const ctx = { colours, at };
      const attribute = element.attributes.properties.find((one): one is import("typescript").JsxAttribute => ts.isJsxAttribute(one) && one.name.getText(sf) === "className");
      if (!attribute) {
        const made = restyle([""], css, ctx);
        if ("why" in made) selectors.forEach((selector) => skip(selector, made.why));
        else if (made.pieces[0]) {
          changes.push({ start: element.tagName.end, end: element.tagName.end, text: ` className="${made.pieces[0]}"` });
          wrote.push(...selectors);
        }
        continue;
      }
      // The static text of the class list, in pieces with where each sits: a plain string is one, a template literal has one between each `${...}`.
      const init = attribute.initializer;
      const value = init && ts.isJsxExpression(init) ? init.expression : init;
      const spans: { text: string; start: number; end: number }[] | null = !value
        ? null
        : ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
          ? [{ text: value.text, start: value.getStart(sf) + 1, end: value.end - 1 }]
          : ts.isTemplateExpression(value)
            ? [
                { text: value.head.text, start: value.head.getStart(sf) + 1, end: value.head.end - 2 },
                ...value.templateSpans.map((span) => ({ text: span.literal.text, start: span.literal.getStart(sf) + 1, end: span.literal.end - (ts.isTemplateTail(span.literal) ? 1 : 2) })),
              ]
            : null;
      if (!spans) {
        selectors.forEach((selector) => skip(selector, "This element's classes are built from code (not plain text), so there's nowhere certain to write the change."));
        continue;
      }
      const made = restyle(spans.map((one) => one.text), css, ctx);
      if ("why" in made) {
        selectors.forEach((selector) => skip(selector, made.why));
        continue;
      }
      spans.forEach((one, index) => {
        if (made.pieces[index] !== one.text) changes.push({ start: one.start, end: one.end, text: made.pieces[index] });
      });
      wrote.push(...selectors);
    }
    for (const { line, col, edit } of texts) {
      const element = elementAt(line, col);
      const parent = element && ts.isJsxOpeningElement(element) ? element.parent : null;
      const words = edit.was?.trim();
      const child = parent?.children.find((one): one is import("typescript").JsxText => ts.isJsxText(one) && !!one.text.trim() && (!words || one.text.trim() === words));
      if (!parent || !child) skip(edit.selector, "These words aren't plain text in the copy's file, so there's nowhere certain to write them.");
      else if (/[{}<>]/.test(edit.text)) skip(edit.selector, "Braces and angle brackets can't be typed into the file this way.");
      else {
        const inside = child.text;
        const at = inside.indexOf(inside.trim());
        changes.push({ start: child.pos + at, end: child.pos + at + inside.trim().length, text: edit.text });
        wrote.push(edit.selector);
      }
    }
    // An element taken out goes from the file, with the line it was on when it stood alone there. It is refused where there is nothing left to hold what is
    // around it (what a component returns, an element in a condition or a loop): that is not the element's to leave.
    const gone: { start: number; end: number }[] = [];
    for (const { line, col, selector, expect } of removals) {
      const opening = elementAt(line, col);
      const node = opening && ts.isJsxOpeningElement(opening) ? opening.parent : opening;
      const tag = opening?.tagName.getText(sf).toLowerCase();
      if (!node) {
        skip(selector, `Nothing is at ${line}:${col} of ${label} any more: the file has changed since the page loaded.`);
      } else if (expect && tag !== expect) {
        skip(selector, `What is at ${line}:${col} of ${label} is a ${tag}, not the ${expect} that was picked: the file has changed since the page loaded, so nothing was removed.`);
      } else if (!node.parent || !(ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
        skip(selector, "It can't be taken out on its own: it is what its component returns, or it is in a condition or a loop. Change that in the code.");
      } else {
        let start = node.getStart(sf);
        let back = start;
        while (back > 0 && (source[back - 1] === " " || source[back - 1] === "\t")) back--;
        if (source[back - 1] === "\n") start = source[back - 2] === "\r" ? back - 2 : back - 1;
        gone.push({ start, end: node.end });
        wrote.push(selector);
      }
    }
    // What was changed inside what is taken out goes with it; one taken out inside another taken out is part of that.
    const outer = gone.filter((one) => !gone.some((other) => other !== one && other.start <= one.start && other.end >= one.end && (other.start < one.start || other.end > one.end)));
    for (let at = changes.length - 1; at >= 0; at--) if (outer.some((one) => changes[at].start >= one.start && changes[at].end <= one.end)) changes.splice(at, 1);
    for (const one of outer) changes.push({ start: one.start, end: one.end, text: "" });
    if (!changes.length) continue;

    changes.sort((a, b) => b.start - a.start);
    let out = source;
    for (const change of changes) out = out.slice(0, change.start) + change.text + out.slice(change.end);
    // Never leave a file that no longer reads.
    const broken = ts.transpileModule(out, { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest } }).diagnostics?.length;
    if (broken) {
      wrote.forEach((selector) => skip(selector, `That change would have left ${label} unreadable, so it wasn't written.`));
      continue;
    }
    await writeFile(`${path}.tmp`, out);
    await rename(`${path}.tmp`, path);
    result.touched.push({ path: relative(folder, path), before: source, after: out });
    result.saved.push(...wrote);
    result.where.push(label);
  }
  return result;
}

