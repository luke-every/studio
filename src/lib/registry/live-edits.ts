import "server-only";

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import type { Edit } from "@/lib/edits";

import { workingFolder } from "./local-prototypes";

/**
 * Writes the edits made on a live version into its own source, on this machine, so the running app has them and the
 * dev server shows them as it does any change to a file.
 *
 * Only what is certain is written. A prototype keeps its words in `src/lib/copy.ts`, and in dev tags each line with
 * where it is in the file (see `copyOf` in `edit-dom.ts`), so an element being edited says which line it shows. That
 * line, and only that line, is rewritten. Words are never looked for in the code: an element that doesn't say where
 * its words are from is left, and told. Styling and props aren't written yet.
 *
 * A replaced picture is the same: the copy file also holds the prototype's image addresses, tagged in dev with their
 * line (see `imageIdIn` in `edit-dom.ts`), so the picture being replaced says which line is its address. The new file
 * is written to `public/img/uploads/` and that line is set to it.
 */
export type LiveSave = { saved: string[]; where: string[]; left: { selector: string; why: string }[] };

/** A picture to write: the file as it was picked. */
export type Upload = { name: string; bytes: Buffer };

/** What an image address looks like in the copy file (as in the starter's `studio-copy.ts`). */
const IMAGE = /^(https?:\/\/|\/)[^\s#]*\.(png|jpe?g|webp|gif|avif|svg)(\?[^\s#]*)?$/i;
const EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg"]);

type Leaf = { start: number; end: number; text: string | null; path: string };

/** The lines of words in the copy file, in the order the page numbers them: each string, empty ones too, depth first. */
async function leavesOf(code: string): Promise<Leaf[]> {
  const ts = await import("typescript");
  const source = ts.createSourceFile("copy.ts", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let root: import("typescript").ObjectLiteralExpression | null = null;
  const find = (node: import("typescript").Node) => {
    if (root) return;
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tagged") {
      let arg: import("typescript").Expression | undefined = node.arguments[0];
      while (arg && (ts.isAsExpression(arg) || ts.isSatisfiesExpression(arg) || ts.isParenthesizedExpression(arg))) arg = arg.expression;
      if (arg && ts.isObjectLiteralExpression(arg)) root = arg;
    }
    ts.forEachChild(node, find);
  };
  find(source);
  if (!root) throw new Error("copy.ts isn't written as tagged({ … }).");

  const leaves: Leaf[] = [];
  const walk = (node: import("typescript").Expression, path: string) => {
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) return walk(node.expression, path);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      leaves.push({ start: node.getStart(), end: node.getEnd(), text: node.text, path });
    } else if (ts.isTemplateExpression(node)) {
      leaves.push({ start: node.getStart(), end: node.getEnd(), text: null, path });
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop) || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) throw new Error("copy.ts has something other than plain words in it, so lines can't be told apart.");
        walk(prop.initializer, path ? `${path}.${prop.name.text}` : prop.name.text);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      node.elements.forEach((el, i) => {
        if (ts.isSpreadElement(el)) throw new Error("copy.ts has something other than plain words in it, so lines can't be told apart.");
        walk(el, `${path}[${i}]`);
      });
    }
  };
  walk(root, "");
  return leaves;
}

const asString = (text: string) => JSON.stringify(text);

/** Where a picked file goes in the prototype, under a name that is safe and not already taken: the address to write in the copy file. */
async function store(folder: string, upload: Upload) {
  const extension = extname(upload.name).toLowerCase();
  if (!EXTENSIONS.has(extension)) throw new Error("That isn't a picture the studio can use: a png, jpg, webp, gif, avif or svg.");
  const base = upload.name.slice(0, upload.name.length - extension.length).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
  const dir = join(folder, "public", "img", "uploads");
  await mkdir(dir, { recursive: true });
  let name = `${base}${extension}`;
  for (let n = 2; await access(join(dir, name)).then(() => true, () => false); n++) name = `${base}-${n}${extension}`;
  await writeFile(join(dir, name), upload.bytes);
  return `/img/uploads/${name}`;
}

export async function saveLiveEdits(slug: string, edits: Edit[], uploads: Map<string, Upload> = new Map()): Promise<LiveSave> {
  const folder = workingFolder(slug);
  const file = join(folder, "src", "lib", "copy.ts");
  const result: LiveSave = { saved: [], where: [], left: [] };
  const skip = (selector: string, why: string) => result.left.push({ selector, why });

  const texts = edits.filter((edit): edit is Extract<Edit, { kind: "text" }> => edit.kind === "text");
  const pictures = edits.filter((edit): edit is Extract<Edit, { kind: "image" }> => edit.kind === "image");
  for (const edit of edits) if (edit.kind !== "text" && edit.kind !== "image") skip(edit.selector, "Only copy and pictures are written to the code so far.");
  if (!texts.length && !pictures.length) return result;

  const code = await readFile(file, "utf8").catch(() => null);
  if (code === null) {
    for (const edit of [...texts, ...pictures]) skip(edit.selector, "This prototype has no src/lib/copy.ts to write its words and pictures to.");
    return result;
  }
  const leaves = await leavesOf(code);

  const changes: { leaf: Leaf; text: string }[] = [];
  const taken = (leaf: Leaf) => changes.some((change) => change.leaf === leaf);
  for (const edit of texts) {
    if (edit.text === edit.was) {
      // Typed and put back: nothing to write, and nothing left pending.
      result.saved.push(edit.selector);
      continue;
    }
    const leaf = edit.copy === undefined ? null : leaves[edit.copy];
    if (!leaf) {
      skip(edit.selector, "These words aren't one line of the copy file, so there's nowhere certain to write them.");
    } else if (leaf.text === null) {
      skip(edit.selector, `${leaf.path} is built from parts in copy.ts, so it can't be changed here.`);
    } else if (leaf.text === edit.text) {
      // Already in the file (written by an earlier save, or by Update copy): nothing to write, and nothing to complain about.
      result.saved.push(edit.selector);
    } else if (leaf.text !== edit.was) {
      // The file isn't what the page was drawn from: reloading the page draws it from the file as it is now.
      skip(edit.selector, `copy.ts has changed since this page loaded. Reload it and try again.`);
    } else if (taken(leaf)) {
      skip(edit.selector, `${leaf.path} was edited twice.`);
    } else {
      changes.push({ leaf, text: edit.text });
      result.saved.push(edit.selector);
      result.where.push(leaf.path);
    }
  }
  for (const edit of pictures) {
    const leaf = edit.copy === undefined ? null : leaves[edit.copy];
    const upload = uploads.get(edit.src);
    if (!leaf || leaf.text === null || !IMAGE.test(leaf.text)) {
      skip(edit.selector, "This picture isn't one of the images in the prototype's copy.ts, so there's nowhere certain to write the new one.");
    } else if (!upload) {
      skip(edit.selector, "The picture didn't arrive. Pick it again.");
    } else if (taken(leaf)) {
      skip(edit.selector, `${leaf.path} was replaced twice.`);
    } else {
      changes.push({ leaf, text: await store(folder, upload) });
      result.saved.push(edit.selector);
      result.where.push(leaf.path);
    }
  }
  if (!changes.length) return result;

  let out = code;
  for (const { leaf, text } of changes.sort((a, b) => b.leaf.start - a.leaf.start)) out = out.slice(0, leaf.start) + asString(text) + out.slice(leaf.end);
  await writeFile(`${file}.tmp`, out);
  await rename(`${file}.tmp`, file);
  return result;
}
