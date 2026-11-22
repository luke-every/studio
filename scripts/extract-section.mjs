import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import ts from "typescript";

/**
 * Takes an element of a project's own code out into a component of its own, in `src/components/forks/<Name>/`, so it can be worked on free of the page it sits in.
 * `loc` is where the element is written (`src/app/page.tsx:88:10`: file, line and column of its tag), as the studio reads it off the page.
 *
 *  - An element that is a use of an imported component (`<GlobalUspGridV2 headline={…} items={…} />`) forks that component: its file (and the files beside it) are
 *    copied, and what the page passes it is kept as the props the copy is drawn with. The original is never touched.
 *  - Any other element (markup in the page) becomes a new component of its own, with the imports and constants it uses.
 *  - An element that uses values only the code around it has (state, a loop's item, the page's own props) is not taken: `{ level: "C" }` says what it needs, which
 *    is for Claude, since there is nothing to draw it with alone.
 *
 * Returns the record for `.studio/forks.json` (the helper writes that, and the registry the preview draws from), or `{ error }` or `{ level: "C", reason }`.
 */
const PRODUCTION = join(homedir(), "Claude", "every-website-main");
const EXTENSIONS = [".tsx", ".ts", "/index.tsx", "/index.ts"];

/** The id a component is known by (in the records, the registry and the address of its preview): `GlobalUspGridV2` is `global-usp-grid-v2`. */
const idOf = (name) => name.replace(/^./, (c) => c.toLowerCase()).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/^-/, "");
const pascal = (text) => text.split(/[^A-Za-z0-9]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join("");

/** The file an `@/…` import means: the project's own, else production's (the project imports those through the path overlay). */
export function resolveAlias(dir, specifier) {
  if (!specifier.startsWith("@/")) return null;
  for (const root of [join(dir, "src"), join(PRODUCTION, "src")]) {
    for (const end of EXTENSIONS) {
      const file = join(root, specifier.slice(2) + end);
      if (existsSync(file) && !file.endsWith(sep)) return { file, root };
    }
  }
  return null;
}

/** An import specifier as it will read from a file in the forks folder: relative paths become `@/…`. */
function aliasOf(dir, from, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  const target = resolve(dirname(from), specifier);
  for (const root of [join(dir, "src"), join(PRODUCTION, "src")]) {
    if (target.startsWith(root + sep)) return `@/${relative(root, target).split(sep).join("/")}`;
  }
  return specifier;
}

const isFunctionLike = (node) =>
  ts.isArrowFunction(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isClassLike(node);

/** Whether a declaration is at the top of its file: not inside a function or class. */
function atTopLevel(decl) {
  for (let node = decl.parent; node; node = node.parent) {
    if (ts.isSourceFile(node)) return true;
    if (isFunctionLike(node) || ts.isBlock(node)) return false;
  }
  return false;
}

/** One imported name: where from, and how it is brought in. */
function importInfo(dir, from, decl, name) {
  const declaration = ts.findAncestor(decl, ts.isImportDeclaration);
  const specifier = aliasOf(dir, from, declaration.moduleSpecifier.text);
  if (ts.isImportSpecifier(decl)) return { specifier, kind: "named", imported: (decl.propertyName ?? decl.name).text, local: name };
  if (ts.isNamespaceImport(decl)) return { specifier, kind: "namespace", local: name };
  return { specifier, kind: "default", local: name };
}

/** Import statements for a list of imported names: one for each module, however many names come from it. */
function renderImports(infos) {
  const by = new Map();
  for (const info of infos) {
    const group = by.get(info.specifier) ?? { default: null, namespace: null, named: [] };
    by.set(info.specifier, group);
    if (info.kind === "default") group.default = info.local;
    else if (info.kind === "namespace") group.namespace = info.local;
    else group.named.push(info.imported === info.local ? info.local : `${info.imported} as ${info.local}`);
  }
  return [...by].flatMap(([specifier, group]) => {
    const lines = [];
    if (group.namespace) lines.push(`import * as ${group.namespace} from "${specifier}";`);
    const names = [...new Set(group.named)];
    if (group.default || names.length) lines.push(`import ${[group.default, names.length ? `{ ${names.join(", ")} }` : null].filter(Boolean).join(", ")} from "${specifier}";`);
    return lines;
  });
}

/**
 * What an element uses from outside itself: the imports it needs, the constants at the top of its file (imported from that file when they are exported,
 * copied when they are not), and the names that only exist in the code around it.
 */
function whatItUses(dir, file, program, root, seen = new Set()) {
  const checker = program.getTypeChecker();
  const uses = { imports: new Map(), constants: new Map(), locals: new Set() };
  const [start, end] = [root.getFullStart(), root.end];
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const skip =
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        (ts.isJsxClosingElement(parent) && parent.tagName === node) ||
        ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node && /^[a-z]/.test(node.text));
      if (!skip) {
        const symbol = ts.isShorthandPropertyAssignment(parent) ? checker.getShorthandAssignmentValueSymbol(parent) : checker.getSymbolAtLocation(node);
        const decl = symbol?.declarations?.[0];
        if (decl && !(decl.pos >= start && decl.end <= end)) {
          if (ts.isImportSpecifier(decl) || ts.isImportClause(decl) || ts.isNamespaceImport(decl)) {
            uses.imports.set(node.text, importInfo(dir, file, decl, node.text));
          } else if (atTopLevel(decl)) {
            const statement = ts.findAncestor(decl, ts.isStatement) ?? decl;
            if (!seen.has(statement)) {
              seen.add(statement);
              const inner = whatItUses(dir, file, program, statement, seen);
              for (const [name, line] of inner.imports) uses.imports.set(name, line);
              for (const [name, text] of inner.constants) uses.constants.set(name, text);
              for (const name of inner.locals) uses.locals.add(name);
              const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((one) => one.kind === ts.SyntaxKind.ExportKeyword);
              uses.constants.set(node.text, { exported: !!exported, text: statement.getText() });
            }
          } else {
            uses.locals.add(node.text);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return uses;
}

/** What is wrong with a file that was written, said plainly, or null when it reads: the names in it don't clash, and it is code. */
export function problemIn(file) {
  const program = ts.createProgram({ rootNames: [file], options: { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve, skipLibCheck: true, types: [] } });
  const sf = program.getSourceFile(file);
  if (!sf) return "it couldn't be read back";
  // 2300 duplicate identifier, 2440 an import that clashes with a declaration, 2451 and 2395 other clashing declarations.
  const found = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf).filter((one) => [2300, 2440, 2451, 2395, 2323].includes(one.code))][0];
  return found ? ts.flattenDiagnosticMessageText(found.messageText, " ") : null;
}

/** The component an element is written in: the nearest function that is one (a loop's callback or a handler on the way is not). */
function enclosingComponent(node) {
  let fn = ts.findAncestor(node, isFunctionLike);
  while (fn && !componentName(fn)) fn = ts.findAncestor(fn.parent, isFunctionLike);
  return fn ?? null;
}

/** The name of the component a function is, when it is one (a capital letter, as a component is written). */
function componentName(fn) {
  const name = fn.name?.text ?? (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : null);
  return name && /^[A-Z]/.test(name) ? name : null;
}

/** Where a component is used in the project's pages and components: `file:line:column` of its tag, the pages first. */
function findUsage(dir, name, except) {
  const src = join(dir, "src");
  const found = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".next", "forks"].includes(entry.name)) walk(path);
      } else if (entry.name.endsWith(".tsx") && path !== except) {
        const text = readFileSync(path, "utf8");
        if (!new RegExp(`<${name}[\\s/>]`).test(text)) continue;
        const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        const visit = (node) => {
          if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(sf) === name) {
            const at = sf.getLineAndCharacterOfPosition(node.tagName.getStart(sf));
            found.push(`${relative(dir, path).split(sep).join("/")}:${at.line + 1}:${at.character + 1}`);
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }
  };
  walk(src);
  return found.sort((a, b) => Number(!a.startsWith("src/app/")) - Number(!b.startsWith("src/app/")))[0] ?? null;
}

/**
 * An element that is the whole of what a component draws (what it returns) is that component, wherever it is used: pressing the top of a section means the section as
 * the page uses it, with what the page gives it. Where that use is, or null when the element is not a component's root.
 */
function usageOfRoot(dir, element, file) {
  let node = element;
  // An element that is the only one inside the next, up to what is returned, is the top of the component as much as that is: they are drawn as one.
  for (;;) {
    while (node.parent && ts.isParenthesizedExpression(node.parent)) node = node.parent;
    const above = node.parent;
    const alone = above && ts.isJsxElement(above) && above.children.filter((child) => !(ts.isJsxText(child) && !child.text.trim())).length === 1;
    if (!alone) break;
    node = above;
  }
  const parent = node.parent;
  const owner = parent && ts.isReturnStatement(parent) ? ts.findAncestor(parent, isFunctionLike) : parent && ts.isArrowFunction(parent) && parent.body === node ? parent : null;
  const name = owner ? componentName(owner) : null;
  return name ? findUsage(dir, name, file) : null;
}

/** The folder and component name to use: the name asked for, else made from what the element is. */
const TAG_WORDS = { div: "Block", section: "Section", ul: "List", ol: "List", li: "Item", h1: "Heading", h2: "Heading", h3: "Heading", h4: "Heading", p: "Text", span: "Text", a: "Link", nav: "Nav", header: "Header", footer: "Footer", button: "Button", img: "Image", form: "Form", article: "Article" };
function nameFor(element, asked, within) {
  if (asked) return pascal(asked) || "Section";
  const tag = element.openingElement ? element.openingElement.tagName.getText() : element.tagName.getText();
  if (/^[A-Z]/.test(tag)) return tag;
  const words = [...element.getText().matchAll(/>\s*([A-Za-z][A-Za-z ,'-]{2,40}?)\s*</g)].map((one) => one[1]).find(Boolean);
  if (words) return pascal(words.split(/\s+/).slice(0, 3).join(" "));
  // With no words of its own to name it by, it is named for the component it was in, and what it is.
  return `${within ?? ""}${TAG_WORDS[tag] ?? pascal(tag)}`;
}

/** Copies a component's file, and what it imports from beside itself (`./x`), into `target`; imports of other places are pointed at where they are. */
export function bring(dir, target, file, header, done = new Set()) {
  if (done.has(file)) return;
  done.add(file);
  const original = readFileSync(file, "utf8");
  const text = original.replace(/(from\s+["'])(\.\.?\/[^"']+)(["'])/g, (whole, open, specifier, close) => (specifier.startsWith("./") ? whole : `${open}${aliasOf(dir, file, specifier)}${close}`));
  writeFileSync(join(target, basename(file)), header ? `${header}\n${text}` : text);
  for (const [, name] of original.matchAll(/from\s+["']\.\/([\w.-]+)["']/g)) {
    const beside = [".tsx", ".ts", ""].map((end) => join(dirname(file), name + end)).find((one) => existsSync(one) && !one.endsWith(sep));
    if (beside && /\.(tsx?|css)$/.test(beside)) bring(dir, target, beside, "", done);
  }
}

/** The components in the project's own files and in production's, by name: where each is written. The project's come first, so its own is the one a name means. */
let indexed = null;
export function componentIndex(dir) {
  if (indexed && indexed.dir === dir && Date.now() - indexed.at < 30_000) return indexed.found;
  const found = new Map();
  const patterns = [/export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Z]\w*)/g, /export\s+const\s+([A-Z]\w*)\s*(?::[^=]+)?=/g];
  for (const root of [join(dir, "src"), join(PRODUCTION, "src")]) {
    if (!existsSync(root)) continue;
    const walk = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          // The pages and layouts aren't components to take out; and a copy is not the original.
          if (!["node_modules", ".next", "forks", "app", "e2e"].includes(entry.name)) walk(path);
        } else if (entry.name.endsWith(".tsx") && !/\.(test|stories)\.tsx$/.test(entry.name)) {
          const text = readFileSync(path, "utf8");
          for (const pattern of patterns) for (const [, name] of text.matchAll(pattern)) if (!found.has(name)) found.set(name, { file: path, root });
        }
      }
    };
    walk(root);
  }
  indexed = { dir, at: Date.now(), found };
  return found;
}

/** The names of the components and tags a captured props object describes (see `capture-props.ts`), the components of them only. */
function elementNames(value, names = new Set()) {
  if (Array.isArray(value)) value.forEach((one) => elementNames(one, names));
  else if (value && typeof value === "object") {
    if (typeof value.$el === "string" && /^[A-Z]/.test(value.$el) && value.$el !== "Fragment") names.add(value.$el);
    Object.values(value).forEach((one) => elementNames(one, names));
  }
  return names;
}

/** The imports for the components a captured description builds, each under a name of its own (`T_Name`) so it can never meet another of that name. */
function typeImports(dir, value) {
  const index = componentIndex(dir);
  const made = [];
  for (const name of elementNames(value)) {
    const hit = index.get(name);
    if (hit) made.push({ name, line: `import { ${name} as T_${name} } from "@/${relative(hit.root, hit.file).split(sep).join("/").replace(/\.tsx?$/, "")}";` });
  }
  return made;
}

/** A TypeScript type for a value that was captured, for the props of a component made from it. */
function typeOfPlain(value, depth = 0) {
  if (value === null) return "null";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (Array.isArray(value)) {
    const kinds = [...new Set(value.slice(0, 6).map((one) => typeOfPlain(one, depth + 1)))];
    return kinds.length ? `${kinds.length > 1 ? `(${kinds.join(" | ")})` : kinds[0]}[]` : "unknown[]";
  }
  if (value && typeof value === "object") {
    if (value.$fn === true) return "() => void";
    if (typeof value.$date === "string") return "Date";
    if (typeof value.$el === "string") return "ReactNode";
    if (depth > 3) return "Record<string, unknown>";
    return `{ ${Object.entries(value).map(([key, one]) => `${/^[A-Za-z_]\w*$/.test(key) ? key : JSON.stringify(key)}: ${typeOfPlain(one, depth + 1)}`).join("; ")} }`;
  }
  return "unknown";
}

/** A folder in the forks folder that is not taken: `Name`, else `Name-2`, `Name-3`. Every element pulled out is a fork of its own. */
function freshFolder(dir, records, name) {
  let folder = name;
  for (let n = 2; existsSync(join(dir, "src", "components", "forks", folder)) || records[idOf(folder)]; n++) folder = `${name}-${n}`;
  return folder;
}

/**
 * A whole component: the one an element is the top of. Its file is forked, and what it has now (what it was given, children included) is what it is drawn with.
 * Null when it isn't one of the project's or production's own (the caller carries on with the element as markup).
 */
function forkWhole({ dir, top, commits, records }) {
  const hit = componentIndex(dir).get(top.name);
  if (!hit) return null;
  const src = join(dir, "src");
  const props = top.props && typeof top.props === "object" ? top.props : {};
  const baseline = JSON.stringify(props);
  // Every one pulled out is a fork of its own, with files of its own: what is changed in one is not changed in another.
  const folder = freshFolder(dir, records, top.name);
  const id = idOf(folder);
  const own = hit.root === src;
  const place = own ? `project:${relative(dir, hit.file).split(sep).join("/")}` : `production:${relative(dirname(hit.root), hit.file).split(sep).join("/")}`;
  const commit = own ? commits.project : commits.production;
  const target = join(dir, "src", "components", "forks", folder);
  mkdirSync(target, { recursive: true });
  bring(dir, target, hit.file, `// A copy of ${top.name} (${place}${commit ? `, at ${commit}` : ""}) for this project. The original is not touched: what is changed here is what is proposed.`);
  const types = typeImports(dir, props);
  return {
    id,
    record: {
      label: top.name,
      folder,
      file: basename(hit.file).replace(/\.tsx?$/, ""),
      exportName: top.name,
      baseline,
      imports: types.map((one) => one.line),
      elementTypes: types.map((one) => one.name),
      from: { source: place, commit: commit ?? "", ...(top.usedAt ? { usedAt: top.usedAt } : {}) },
      at: new Date().toISOString(),
    },
  };
}

/**
 * What an element uses that is the props of the component it is written in: those the page can say, from what that component has now. Each such name becomes a prop of the
 * new component, with a type made from the value. Null when something it uses is not a prop (state, a loop's item): there is nothing to give that.
 */
function ownProps({ element, uses, owners }) {
  const fn = enclosingComponent(element);
  const name = fn ? componentName(fn) : null;
  const first = fn?.parameters?.[0];
  if (!fn || !name || !first) return { why: [...uses.locals] };
  const owner = owners.find((one) => one.name === name && one.props && typeof one.props === "object");
  if (!owner) return { why: [...uses.locals] };
  const given = owner.props;
  const params = [];
  let whole = null;
  if (ts.isIdentifier(first.name)) {
    if (![...uses.locals].every((local) => local === first.name.text)) return { why: [...uses.locals].filter((local) => local !== first.name.text) };
    whole = first.name.text;
  } else if (ts.isObjectBindingPattern(first.name)) {
    const bound = new Map(first.name.elements.filter((one) => ts.isIdentifier(one.name)).map((one) => [one.name.text, one]));
    const missing = [...uses.locals].filter((local) => !bound.has(local));
    if (missing.length) return { why: missing };
    for (const local of uses.locals) {
      const one = bound.get(local);
      params.push({ key: (one.propertyName ?? one.name).getText(), text: one.getText(), value: given[(one.propertyName ?? one.name).getText()] });
    }
  } else return { why: [...uses.locals] };
  if (whole) return { whole, baseline: given, types: `type Props = ${typeOfPlain(given)};` };
  const baseline = Object.fromEntries(params.filter((one) => one.value !== undefined).map((one) => [one.key, one.value]));
  const fields = params.map((one) => `  ${/^[A-Za-z_]\w*$/.test(one.key) ? one.key : JSON.stringify(one.key)}${one.value === undefined ? "?" : ""}: ${one.value === undefined ? "unknown" : typeOfPlain(one.value)};`);
  return { signature: `{ ${params.map((one) => one.text).join(", ")} }: Props`, baseline, types: `type Props = {\n${fields.join("\n")}\n};` };
}

/**
 * The last resort, for an element that can't be taken as code: one whose code uses values only the code around it has (state, a value worked out from it, a handler), or that has no
 * place in this project's code at all. What the page draws is still there, so the component made is of that: the markup of the element as the page draws it now (`jsxOf`), as a component
 * with no props, in the folder the others go to. It looks as it does on the page and doesn't run. Returns the record as `extractSection` does (with `snapshot: true`), or `{ error }`.
 */
export function snapshotSection({ dir, loc, name, markup, records = {}, commits = {} }) {
  const found = /^(.+):(\d+):(\d+)$/.exec(loc ?? "");
  const place = found ? `${found[1]}:${found[2]}` : null;
  const label = pascal(name ?? "") || (found ? `${pascal(basename(found[1]).replace(/\.tsx?$/, ""))}Snapshot` : "Snapshot");
  const folder = freshFolder(dir, records, label);
  const fn = folder.replace(/-(\d+)$/, "$1");
  const target = join(dir, "src", "components", "forks", folder);
  const existed = existsSync(target);
  mkdirSync(target, { recursive: true });
  const body = `// Markup taken out of ${place ?? "the page"} as it was drawn (a snapshot) for this project. It stands on its own and doesn't run. The original is not touched: what is changed here is what is proposed.\n\nexport function ${fn}() {\n  return (\n${markup.split("\n").map((row) => `    ${row}`).join("\n")}\n  );\n}\n`;
  const file = join(target, `${fn}.tsx`);
  writeFileSync(file, body);
  const problem = problemIn(file);
  if (problem) {
    if (!existed) rmSync(target, { recursive: true, force: true });
    return { error: `It couldn't be taken out cleanly (${problem}), so nothing was added to the project.` };
  }
  return {
    id: idOf(folder),
    snapshot: true,
    record: { label, folder, file: fn, exportName: fn, baseline: "{}", imports: [], elementTypes: [], from: { source: place ? `project:${place}` : "snapshot", commit: commits.project ?? "" }, at: new Date().toISOString() },
  };
}

export function extractSection({ dir, loc, name, commits = {}, records = {}, followed = false, top = null, owners = [] }) {
  // The element is the top of a component: the component is taken, with what it has now.
  if (top?.name && !followed) {
    const whole = forkWhole({ dir, top, commits, records });
    if (whole) return whole;
  }
  const found = /^(.+):(\d+):(\d+)$/.exec(loc ?? "");
  if (!found) return { error: "That element has no place in the code." };
  const file = resolve(dir, found[1]);
  const src = join(dir, "src");
  if (!file.startsWith(src + sep) || !file.endsWith(".tsx") || !existsSync(file)) return { error: "That isn't one of this project's own files." };
  const [line, col] = [Number(found[2]), Number(found[3])];

  const program = ts.createProgram({ rootNames: [file], options: { noResolve: true, noLib: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest, skipLibCheck: true, types: [] } });
  const sf = program.getSourceFile(file);
  if (!sf) return { error: "That file couldn't be read." };
  // Binding the file (which asking for the checker does) is what gives each node its parent.
  program.getTypeChecker();
  let element = null;
  const find = (node) => {
    if (element) return;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const at = sf.getLineAndCharacterOfPosition(node.tagName.getStart(sf));
      if (at.line + 1 === line && at.character + 1 === col) element = ts.isJsxOpeningElement(node) ? node.parent : node;
    }
    ts.forEachChild(node, find);
  };
  find(sf);
  if (!element) return { error: "Nothing is there any more: the file has changed since the page loaded." };

  // The top of a component is the component: it is taken as the page uses it.
  const used = followed || file.includes(`${sep}forks${sep}`) ? null : usageOfRoot(dir, element, file);
  if (used) return extractSection({ dir, loc: used, name, commits, records, followed: true });

  const uses = whatItUses(dir, file, program, element);
  // What it uses from the component it is written in, when that is its props: they are given what the page has them as now.
  const borrowed = uses.locals.size ? ownProps({ element, uses, owners }) : null;
  if (borrowed?.why?.length || (uses.locals.size && !borrowed)) return { level: "C", reason: `It uses ${[...(borrowed?.why ?? uses.locals)].slice(0, 4).join(", ")} from the code around it, which the page can't say.` };

  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const tag = opening.tagName.getText();
  const relative_ = relative(dir, file).split(sep).join("/");
  const lines = `${sf.getLineAndCharacterOfPosition(element.getStart(sf)).line + 1}-${sf.getLineAndCharacterOfPosition(element.end).line + 1}`;
  const at = new Date().toISOString();
  const head = (what) => `// ${what} for this project. The original is not touched: what is changed here is what is proposed.`;

  // A constant at the top of the page that isn't exported can't be imported: it is copied. An exported one is imported from where it is.
  const constants = [...uses.constants.entries()];
  const fromHere = constants.filter(([, one]) => one.exported).map(([constant]) => ({ specifier: `@/${relative(src, file).split(sep).join("/").replace(/\.tsx?$/, "")}`, kind: "named", imported: constant, local: constant }));
  const copied = constants.filter(([, one]) => !one.exported).map(([, one]) => one.text);

  // 1. A use of an imported component, with plain props: that component is forked.
  const tagImport = /^[A-Z]/.test(tag) && !tag.includes(".") ? sf.statements.filter(ts.isImportDeclaration).flatMap((one) => {
    const clause = one.importClause;
    if (!clause) return [];
    const named = clause.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.find((el) => el.name.text === tag) : null;
    return named ? [{ exportName: (named.propertyName ?? named.name).text, specifier: one.moduleSpecifier.text }] : clause.name?.text === tag ? [{ exportName: null, specifier: one.moduleSpecifier.text }] : [];
  })[0] : null;
  const componentFile = tagImport ? resolveAlias(dir, tagImport.specifier) ?? (tagImport.specifier.startsWith(".") ? { file: ["", ".tsx", ".ts"].map((end) => resolve(dirname(file), tagImport.specifier + end)).find((one) => existsSync(one) && !one.endsWith(sep)), root: src } : null) : null;
  const plain = !opening.attributes.properties.some(ts.isJsxSpreadAttribute) && (ts.isJsxSelfClosingElement(element) || element.children.every((child) => ts.isJsxText(child) && !child.text.trim()));
  if (tagImport && componentFile?.file && plain) {
    const exportName = tagImport.exportName ?? tag;
    const folder = freshFolder(dir, records, exportName);
    const id = idOf(folder);
    const placeCommit = componentFile.root === src ? commits.project : commits.production;
    {
      const target = join(dir, "src", "components", "forks", folder);
      mkdirSync(target, { recursive: true });
      const fromPlace = componentFile.root === src ? `project:${relative(dir, componentFile.file).split(sep).join("/")}` : `production:${relative(dirname(componentFile.root), componentFile.file).split(sep).join("/")}`;
      bring(dir, target, componentFile.file, head(`A copy of ${exportName} (${fromPlace}${placeCommit ? `, at ${placeCommit}` : ""})`));
    }
    const props = opening.attributes.properties.map((attribute) => {
      if (!ts.isJsxAttribute(attribute)) return null;
      const key = JSON.stringify(attribute.name.getText());
      const value = attribute.initializer;
      if (!value) return `${key}: true`;
      if (ts.isStringLiteral(value)) return `${key}: ${JSON.stringify(value.text)}`;
      if (ts.isJsxExpression(value) && value.expression) return `${key}: ${value.expression.getText()}`;
      return null;
    });
    if (props.includes(null)) return { level: "C", reason: "Something it is given isn't a plain value." };
    const imports = renderImports([...[...uses.imports.entries()].filter(([name]) => name !== tag).map(([, info]) => info), ...fromHere]);
    const fromSource = componentFile.root === src ? `project:${relative(dir, componentFile.file).split(sep).join("/")}` : `production:${relative(dirname(componentFile.root), componentFile.file).split(sep).join("/")}`;
    return {
      id,
      record: { label: exportName, folder, file: basename(componentFile.file).replace(/\.tsx?$/, ""), exportName, baseline: `{ ${props.join(", ")} }`, imports, from: { source: fromSource, commit: placeCommit ?? "", usedAt: `${relative_}:${lines}` }, at },
    };
  }

  // 2. Markup: a component of its own. It never takes the name of something it uses (a use of `GlobalPillarsV2` is `GlobalPillarsV2Section`, not a second `GlobalPillarsV2`).
  const usedNames = new Set([...uses.imports.keys(), ...constants.map(([constant]) => constant)]);
  const enclosing = enclosingComponent(element);
  let label = nameFor(element, name, enclosing ? componentName(enclosing) : null);
  while (usedNames.has(label)) label = `${label}Section`;
  const folder = freshFolder(dir, records, label);
  // The folder can carry a number after a dash (`Name-2`); the component's own name is a name, so it carries it without.
  const fn = folder.replace(/-(\d+)$/, "$1");
  const id = idOf(folder);
  // Where it is a use of a component of the project's (or production's) own, that component is forked as well, and the new one made to use the copy, so what is
  // changed inside it is changed in the copy and never in the original.
  const created = [];
  if (tagImport && componentFile?.file) {
    const exportName = tagImport.exportName ?? tag;
    // Its own copy of that component too, for this one alone.
    const forkFolder = freshFolder(dir, records, exportName);
    const forkTarget = join(dir, "src", "components", "forks", forkFolder);
    const fileName = basename(componentFile.file).replace(/\.tsx?$/, "");
    {
      created.push(forkTarget);
      mkdirSync(forkTarget, { recursive: true });
      const place = componentFile.root === src ? `project:${relative(dir, componentFile.file).split(sep).join("/")}` : `production:${relative(dirname(componentFile.root), componentFile.file).split(sep).join("/")}`;
      const placeCommit = componentFile.root === src ? commits.project : commits.production;
      bring(dir, forkTarget, componentFile.file, head(`A copy of ${exportName} (${place}${placeCommit ? `, at ${placeCommit}` : ""})`));
    }
    uses.imports.set(tag, { specifier: `@/components/forks/${forkFolder}/${fileName}`, kind: "named", imported: exportName, local: tag });
  }
  const target = join(dir, "src", "components", "forks", folder);
  if (!existsSync(target)) created.push(target);
  mkdirSync(target, { recursive: true });
  const clientDirective = /^\s*["']use client["'];?/.test(sf.text) ? '"use client";\n\n' : "";
  // The element as it was written, moved to the left by how far in the line it began, and in by what it is now inside.
  const startedAt = /^\s*/.exec(sf.text.split("\n")[sf.getLineAndCharacterOfPosition(element.getStart(sf)).line])[0].length;
  const indent = (text) => text.split("\n").map((row, index) => (index === 0 ? `    ${row}` : row.trim() ? `    ${row.slice(Math.min(startedAt, /^\s*/.exec(row)[0].length))}` : "")).join("\n");
  const importLines = [...(borrowed?.types?.includes("ReactNode") ? ['import type { ReactNode } from "react";'] : []), ...renderImports([...uses.imports.values(), ...fromHere])];
  const propsType = borrowed?.types ? `${borrowed.types}\n\n` : "";
  const signature = borrowed?.whole ? `${borrowed.whole}: Props` : (borrowed?.signature ?? "");
  const body = `${clientDirective}${head(`Markup taken out of ${relative_}:${lines}`)}\n${importLines.join("\n")}${importLines.length ? "\n\n" : ""}${copied.length ? `${copied.join("\n\n")}\n\n` : ""}${propsType}export function ${fn}(${signature}) {\n  return (\n${indent(element.getText())}\n  );\n}\n`;
  writeFileSync(join(target, `${fn}.tsx`), body);
  // Never leave the project with a file that doesn't read: what was made for this is taken away again.
  const problem = problemIn(join(target, `${fn}.tsx`));
  if (problem) {
    for (const made of created) rmSync(made, { recursive: true, force: true });
    return { error: `It couldn't be taken out cleanly (${problem}), so nothing was added to the project.` };
  }
  // What it is drawn with: what the component it was in has now, for the props it uses; and the components that is made of, which are named so they can be built again.
  const baseline = borrowed?.baseline ?? {};
  const types = typeImports(dir, baseline);
  return {
    id,
    record: { label, folder, file: fn, exportName: fn, baseline: JSON.stringify(baseline), imports: types.map((one) => one.line), elementTypes: types.map((one) => one.name), from: { source: `project:${relative_}:${lines}`, commit: commits.project ?? "" }, at },
  };
}
