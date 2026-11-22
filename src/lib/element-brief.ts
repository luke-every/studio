import ts from "typescript";

import type { Provenance } from "@/lib/registry/production";

/**
 * What an engineer's agent gets for one element: its code and nothing else, with where the rest is. `loc` is `file:line:col` as `data-studio-loc` writes it (the
 * position of the tag's name). The snippet is the whole element (children too), cut at `MAX_LINES`; the imports are only the ones it uses.
 */
const MAX_LINES = 80;

/** A component the section uses, as the caller found it: where its file is, and how it stands against production. */
export type Used = {
  /** Links to its file (on the studio, and on GitHub when pushed); none when it couldn't be read. */
  links: string[];
  /** Against production, where production is on this machine: at the same path, at another, or nowhere. */
  against?: { status: "same-path" | "moved" | "none"; path?: string } | null;
  /** The lines in it marked `TODO(lift)`. */
  todos?: { line: number; text: string }[];
  /** Colours written out in it that aren't the design system's tokens (see `coloursIn`). */
  colours?: { line: number; value: string }[];
  /** Its text, to tell which notes are about it. */
  source?: string;
  /** Its text is the same as production's file at `against.path`. */
  identical?: boolean;
  /** What its doc comment says about where it comes from. */
  provenance?: Provenance | null;
  /** Production's file at `against.path`, to say how the props of a port differ from its. */
  productionSource?: string;
};

/** A note for the developers, left by the designer on the canvas. */
export type NoteLine = { n: number; author: string; text: string; device?: string; setup?: string; /** The start of the text of the element it was left on: found in this section or what it uses, the note is about it. */ anchorText?: string; /** The canvas found the element it was left on inside the section that was picked (the link carries which). */ related?: boolean; replies: { author: string; text: string }[] };
/** A picture of the section, the page, or a kept state, at a width. */
export type Picture = { label: string; links: { width: number; url: string }[] };
/** The ways the prototype can be seen: the sizes it is drawn at on the canvas, and the controls it offers (each a parameter of its address). */
export type Ways = { devices: { name: string; width: number }[]; controls: { label: string; param: string; options: { value: string; label: string }[]; fallback?: string }[] };

/** Colours written out in a file: a hex value, or a colour from Tailwind's own palette. The design system's tokens are the only colours the conventions allow. */
export function coloursIn(source: string) {
  const found: { line: number; value: string }[] = [];
  source.split("\n").forEach((row, at) => {
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(row)) return;
    for (const match of row.matchAll(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}(?![\w-])|\b(?:bg|text|border|ring|fill|stroke)-(?:gray|neutral|stone|slate|zinc|red|blue|green|yellow|orange|purple|pink)-\d{2,3}\b/g)) found.push({ line: at + 1, value: match[0] });
  });
  return found;
}

export type ElementContext = {
  file: string;
  line: number;
  column: number;
  /** A link to the whole file on the studio, and on GitHub when the version is pushed. */
  fileLinks: string[];
  /** The production file this one is a port of, when it is known. */
  production?: string;
  /** What a file in the prototype is against production, when it came from a fork: a direct copy, an extended version, or new. Gets the path without an extension. */
  origin?: (path: string) => string | null;
  /** The components the section uses, by the path they resolve to (without an extension), as found by the caller. */
  uses?: Record<string, Used>;
  /** What this file says about where it comes from (see `provenanceOf`). */
  provenance?: Provenance | null;
  /** Production's file this one is compared with, and its text: only the lines of the section are looked for in it. */
  against?: { path: string; source: string } | null;
  /** Where the section is in the design. */
  design?: string;
  /** What the designer wrote about the version. */
  note?: { version: string; title?: string; changes?: string } | null;
  /** The states kept on the canvas, each with a picture of it where one can be made. */
  states?: { name: string; steps: number; pictures?: { width: number; url: string }[] }[];
  /** Notes for the developers on this version. */
  notes?: NoteLine[];
  /** Pictures, where they can be made (on the machine the prototype runs on). */
  pictures?: Picture[];
  /** The sizes and controls it is seen at. */
  ways?: Ways;
};

export type Nested = { name: string; spec: string; target: string };

/** Where an import points, from the project's folder, when it is the project's own (`@/…` is `src/…`, `./` is beside the file). */
function resolveImport(from: string, specifier: string) {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith(".")) return null;
  const parts = from.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/** The components (tags) the element at a place renders that the project imports, each with the path it resolves to: for a caller to find before it writes the brief. */
export function usedComponents(source: string, file: string, line: number, column: number): Nested[] {
  const found = parseElement(source, file, line, column);
  return found ? found.nested : [];
}

function parseElement(source: string, file: string, line: number, column: number) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hit: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
  const visit = (node: ts.Node) => {
    if (hit.length) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const at = sf.getLineAndCharacterOfPosition(opening.tagName.getStart(sf));
      if (at.line + 1 === line && at.character + 1 === column) {
        hit.push(node as ts.JsxElement | ts.JsxSelfClosingElement);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const element = hit[0];
  if (!element) return null;
  const used = new Set<string>();
  const tags = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node)) used.add(node.text);
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^[A-Z]/.test(node.tagName.getText(sf))) tags.add(node.tagName.getText(sf).split(".")[0]);
    ts.forEachChild(node, collect);
  };
  collect(element);
  const imports: string[] = [];
  const nested: Nested[] = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    const names = [clause?.name?.text, ...(clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map((one) => one.name.text) : []), clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? clause.namedBindings.name.text : undefined].filter((one): one is string => !!one);
    if (!names.some((one) => used.has(one))) continue;
    imports.push(statement.getText(sf));
    const target = resolveImport(file, statement.moduleSpecifier.text);
    if (target) for (const name of names) if (tags.has(name)) nested.push({ name, spec: statement.moduleSpecifier.text, target });
  }
  // The module-level constants the section uses (a class string, a number): short ones are shown with it, since the section is unreadable without them.
  const constants: string[] = [];
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      const simple = !!init && (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init) || ts.isNumericLiteral(init) || ts.isArrayLiteralExpression(init) || ts.isObjectLiteralExpression(init));
      if (simple && ts.isIdentifier(declaration.name) && used.has(declaration.name.text) && statement.getText(sf).length <= CONSTANT_MAX) constants.push(statement.getText(sf));
    }
  }
  return { sf, element, imports, nested, constants };
}

/** The longest constant shown with the section. */
const CONSTANT_MAX = 400;

/** The members of a component's props type (`type …Props = {…}` or `interface …Props`), each as written, or null when it has none of that shape. */
export function propsOf(source: string): { name: string; text: string }[] | null {
  const sf = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  for (const statement of sf.statements) {
    const members = ts.isTypeAliasDeclaration(statement) && /Props$/.test(statement.name.text) && ts.isTypeLiteralNode(statement.type) ? statement.type.members : ts.isInterfaceDeclaration(statement) && /Props$/.test(statement.name.text) ? statement.members : null;
    if (members) return members.filter(ts.isPropertySignature).map((member) => ({ name: member.name.getText(sf), text: member.getText(sf).replace(/\s+/g, " ").replace(/[;,]$/, "") }));
  }
  return null;
}

const quoted = (list: string[], most = 8) => list.slice(0, most).map((one) => `\`${one}\``).join(", ") + (list.length > most ? ` and ${list.length - most} more` : "");

/** What a component says about its props: the whole list for a new one, and for a port or extension how they differ from production's. */
function propsLine(used: Used | undefined, standing: string | null) {
  const mine = used?.source ? propsOf(used.source) : null;
  if (!mine?.length) return "";
  if (/^new\b/.test(standing ?? "")) return `\n  - Props: ${mine.map((one) => one.text).join("; ").slice(0, 600)}`;
  const theirs = used?.productionSource ? propsOf(used.productionSource) : null;
  if (!theirs) return "";
  const [here, there] = [new Set(mine.map((one) => one.name)), new Set(theirs.map((one) => one.name))];
  const onlyThere = theirs.map((one) => one.name).filter((name) => !here.has(name));
  const onlyHere = mine.map((one) => one.name).filter((name) => !there.has(name));
  if (!onlyThere.length && !onlyHere.length) return "";
  return `\n  - Props differ from production's: ${[onlyThere.length ? `it also takes ${quoted(onlyThere)}` : "", onlyHere.length ? `this one adds ${quoted(onlyHere)}` : ""].filter(Boolean).join("; ")}.`;
}

/** The most lines of the section shown as not being in production's file. */
const COMPARED = 10;
const rowsOf = (text: string) => text.split("\n").map((row) => row.trim()).filter(Boolean);

/** What the comment says after the production path: what is different, or added. */
const afterPath = (note: string) => note.replace(/^.*?(?:Port of|Extends) every-website `[^`]+`:?\s*/, "").replace(/^New: /, "");

/** What a file says it is: a port, an extension or new, in the words of the comment. */
function provenanceLine(one: Provenance, production?: string) {
  const at = one.production ?? production;
  return one.kind === "new" ? `This file is new. ${one.note.replace(/^.*?New: /, "")}` : `This file ${one.kind === "port" ? "is a port of" : "extends"} \`${at ?? "a production file"}\`${afterPath(one.note) ? `: ${afterPath(one.note)}` : "."}`;
}

/** Where a component the section uses stands against production, in one of five ways: the same file, a port, an extension, new, or different without saying how. */
function standingOf(used: Used | undefined, target: string) {
  if (!used) return null;
  const path = used.against?.path;
  if (used.identical && path) return `reused as is: the same as production's \`${path}\`.`;
  const one = used.provenance;
  if (one?.kind === "port") return `a port of \`${one.production ?? path ?? "a production file"}\`${afterPath(one.note) ? `: ${afterPath(one.note)}` : "."}`;
  if (one?.kind === "extends") return `extends \`${one.production ?? path ?? "a production file"}\`${afterPath(one.note) ? `: ${afterPath(one.note)}` : "."}`;
  if (one?.kind === "new" || used.against?.status === "none") return `new: production has no \`${target.split("/").pop()}\`.`;
  if (used.against?.status === "moved" || used.against?.status === "same-path") return `differs from production's \`${path}\`, and doesn't say how.`;
  return null;
}


/**
 * The brief for one element. What it says is what is the case, not what to do: what the section is made of, where each part stands against production, what is
 * marked as left, what the designer wrote and which states were kept, then the code and where the rest is. The engineer decides what to do with it.
 */
export function elementBrief(source: string, context: ElementContext): string | null {
  const found = parseElement(source, context.file, context.line, context.column);
  if (!found) return null;
  const { sf, element, imports, nested, constants } = found;
  const start = sf.getLineAndCharacterOfPosition(element.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(element.getEnd()).line;
  const lines = source.split("\n").slice(start, end + 1);
  const cut = lines.length > MAX_LINES;

  // What the section is made of: each component, where its file is and how it stands against production.
  const made = nested.map(({ name, spec, target }) => {
    const used = context.uses?.[target];
    const origin = context.origin?.(target);
    const standing = origin ?? standingOf(used, target);
    return `- \`${name}\` (\`${spec}\`)${standing ? `: ${standing}` : ""}${used?.links.length ? ` File: ${used.links.join(" · ")}` : ""}${propsLine(used, standing)}`;
  });
  // Only this section's own lines, looked for in production's file: what the rest of the file does or doesn't have is not part of it.
  const compared: string[] = [];
  if (context.against) {
    const there = new Set(rowsOf(context.against.source));
    const mine = lines.map((text, at) => ({ at: start + at + 1, text: text.trim() })).filter((row) => row.text && !/^(\/\/|\*|\/\*|\{\/\*)/.test(row.text));
    const apart = mine.filter((row) => !there.has(row.text));
    compared.push(apart.length ? `- ${apart.length} of ${mine.length} lines here are not in production's \`${context.against.path}\`${apart.length > COMPARED ? `; the first ${COMPARED}` : ""}:` : `- Every line here is in production's \`${context.against.path}\`.`);
    compared.push(...apart.slice(0, COMPARED).map((row) => `  - \`${context.file.split("/").pop()}:${row.at}\` ${row.text.length > 110 ? `${row.text.slice(0, 110)}…` : row.text}`));
  }

  // Marked as left: in the section's own lines, and in the files of the components it uses.
  const todo = (text: string) => text.replace(/^[\s/{*]+|[\s*/}]+$/g, "").replace(/^TODO\(lift\):?\s*/, "").slice(0, 200);
  const todos: string[] = [];
  lines.forEach((row, at) => {
    if (row.includes("TODO(lift)")) todos.push(`- \`${context.file.split("/").pop()}:${start + at + 1}\` ${todo(row)}`);
  });
  for (const { name, target } of nested) for (const item of context.uses?.[target]?.todos ?? []) todos.push(`- \`${name}:${item.line}\` ${item.text}`);

  const about: string[] = [];
  if (context.design) about.push(`- Where it is in the design: ${context.design}`);
  if (context.note?.title || context.note?.changes) about.push(`- The designer's note on ${context.note.version}${context.note.title ? `, "${context.note.title}"` : ""}${context.note.changes ? `: ${context.note.changes.replace(/\s+/g, " ").trim()}` : "."}`);
  if (context.provenance) about.push(`- ${provenanceLine(context.provenance, context.production)}`);
  const fileOrigin = context.origin?.(context.file.replace(/\.tsx?$/, ""));
  if (fileOrigin) about.push(`- This file is ${fileOrigin}`);

  // Colours written out in this section and in the components it uses.
  const colours: string[] = [];
  const seen = new Set<string>();
  const add = (where: string, found: { line: number; value: string }[]) => {
    for (const one of found) if (!seen.has(`${where}${one.value}`)) {
      seen.add(`${where}${one.value}`);
      colours.push(`- \`${one.value}\` in \`${where}:${one.line}\``);
    }
  };
  add(context.file.split("/").pop() ?? context.file, coloursIn(lines.join("\n")).map((one) => ({ ...one, line: one.line + start })));
  for (const { name, target } of nested) add(name, context.uses?.[target]?.colours ?? []);

  // Notes: the ones left on something in this section come first.
  // Only the notes that are about this section: the canvas says which (the link carries them), and the words a note was left on found in the code are taken too.
  const hay = [lines.join("\n"), ...nested.map(({ target }) => context.uses?.[target]?.source ?? "")].join("\n");
  // Each line of copy carries an invisible mark of where it is written: between two lines it is a space, anywhere else it is nothing.
  const clean = (text?: string) => (text ?? "").replace(/\u2060[\u200c\u200d]{16}\u2060/g, " ").replace(/[\u2060\u200c\u200d]/g, "").replace(/\s+/g, " ").trim();
  const here = (note: NoteLine) => !!note.related || (clean(note.anchorText).length >= 3 && hay.includes(clean(note.anchorText)));
  const on = (note: NoteLine) => (clean(note.anchorText) ? `, on "${clean(note.anchorText).slice(0, 48)}${clean(note.anchorText).length > 48 ? "…" : ""}"` : "");
  const noteOf = (note: NoteLine) => `- #${note.n} by ${note.author}${note.device ? ` (${note.device})` : ""}${on(note)}: ${note.text.replace(/\s+/g, " ").trim()}${note.replies.map((reply) => `\n  - ${reply.author}: ${reply.text.replace(/\s+/g, " ").trim()}`).join("")}`;
  const notes = (context.notes ?? []).filter(here).sort((a, b) => a.n - b.n).map(noteOf);

  // Ways to see it: the sizes it is drawn at, and each control with the value that puts it that way.
  const ways: string[] = [];
  if (context.ways?.devices.length) ways.push(`- Drawn on the canvas at: ${context.ways.devices.map((one) => `${one.name} (${one.width}px)`).join(", ")}.`);
  for (const control of context.ways?.controls ?? []) ways.push(`- ${control.label}, \`?${control.param}=\`: ${control.options.map((one) => `${one.label} (\`${one.value}\`${one.value === control.fallback ? ", the default" : ""})`).join(", ")}.`);
  // One link, and the other widths said as the one thing that changes in it: the same link repeated would be most of the brief.
  const seeing = (links: { width: number; url: string }[]) => (links.length ? `${links[0].url}${links.length > 1 ? ` (${links[0].width}px; the same link at ${links.slice(1).map((one) => `\`width=${one.width}\``).join(" or ")})` : ""}` : "");
  const pictures = (context.pictures ?? []).map((one) => `- ${one.label}: ${seeing(one.links)}`);
  const states = (context.states ?? []).map((one) => `- ${one.name} (${one.steps} ${one.steps === 1 ? "step" : "steps"})${one.pictures?.length ? `: ${seeing(one.pictures)}` : ""}`);

  const section = (title: string, body: string[]) => (body.length ? ["", `## ${title}`, ...body] : []);
  return [
    `# ${context.file}:${start + 1}-${end + 1}`,
    ...section("About this section", about),
    ...section("Pictures", pictures),
    ...section("Notes for the developers", notes),
    ...section("Made of", made),
    ...section("Compared with production", compared),
    ...section("Colours here that aren't tokens", colours),
    ...section(`To wire up (${todos.length})`, todos),
    ...section("Ways to see it", ways),
    ...section("States kept on the canvas", states),
    "",
    "## Code",
    "```tsx",
    ...imports,
    ...(imports.length ? [""] : []),
    ...(constants.length ? ["// Defined above this section, in the same file:", ...constants, ""] : []),
    ...lines.slice(0, MAX_LINES),
    ...(cut ? ["// … cut short: the file has the rest"] : []),
    "```",
    "",
    "## More",
    ...context.fileLinks.map((link) => `- Whole file: ${link}`),
    ...(context.production ? [`- Production counterpart: \`${context.production}\``] : []),
    "",
  ].join("\n");
}
