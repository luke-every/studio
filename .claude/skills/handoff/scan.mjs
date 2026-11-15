/**
 * /handoff's scanner: what a prototype's final variants hand to engineering.
 *
 * Deterministic. Claude decides which variants are final and which files each one renders (that is code-specific);
 * this follows the imports from those entry files, compares every live file with the production repository's design
 * system, and writes one findings file. Nothing in the prototype is changed.
 *
 *   node scan.mjs --dir <prototype> --variant a=src/x/Overview.tsx,src/x/Header.tsx --variant b=... \
 *     --name "Bundle comparison" [--version v0.4]   saved to the studio for that version (default: its newest)
 *     [--out file.json] [--by "Name"] [--dry]          --dry: only written locally, the studio isn't asked
 *     [--no-fix]                                        scan only: exact colours aren't fixed in the prototype's code
 *   node scan.mjs --apply --dir <prototype> --handoff <decisions.json> [--summary f] [--rescan f]   do what the decisions say that a script can
 *   node scan.mjs --restore <backup dir> --dir <prototype> --handoff <decisions.json>                 put a backup back
 *   node scan.mjs --fetch --name "Bundle comparison" [--version v0.4] [--out file.json]   the decisions, once made
 *
 * The finding shape is the same for every rule (see FINDING below), so another rule only adds findings.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------------------------------------------
// Thresholds. Tuned on bundle-comparison; every one is a judgement, so they are named here rather than buried.

/** The production repository whose design system a prototype is compared with. */
export const REPO = "Every-Foods/every-website";
export const BRANCH = "main";
/** Local clones tried, in order, only when `gh` can't read the repository. */
export const LOCAL_CLONES = [join(homedir(), "Claude", "every-website"), join(homedir(), "Claude", "every-website-main")];
/** The design system's folders in that repository, and its colour tokens. */
const DS_DIRS = ["src/components/shared", "src/components/shared/modals"];
const ICON_DIR = "src/components/icons";
const TOKENS_FILE = "src/app/globals.css";

/** An element this alike to a design-system component's root (0..1, see `matchScore`) re-implements it. */
export const NEAR_MATCH = 0.45;
/** ...and its own classes must share at least this much with the component's root, whatever the structure says. */
export const ROOT_MIN = 0.3;
/** ...and share at least this many look classes (a colour, a radius, a font): matching layout alone is just a flex box. */
export const LOOK_MIN = 1;
/** How the three signals add up to a match score. */
export const WEIGHTS = { classes: 0.6, structure: 0.25, name: 0.15 };
/** A colour, a radius, a font, a border is the look; padding and layout values can differ in a near-match. */
export const LOOK_WEIGHT = 2;
export const LAYOUT_WEIGHT = 1;
/** Candidates listed per finding, and the lowest score worth listing. */
export const MAX_CANDIDATES = 3;
export const CANDIDATE_MIN = 0.25;
/** Two of the prototype's own components this alike are flagged as duplicates of each other. */
export const DUPLICATE = 0.6;
/** Rendered from this many places in the live files: worth a place in the system. */
export const REUSE_MIN_USES = 2;
/** A colour within this CIE76 distance (ΔE) of a token is "near" it. Around 2 is the smallest difference people see. */
export const NEAR_DELTA_E = 6;
/** Tailwind's own colours the conventions allow beside the theme's (`bg-black/50` for an overlay). */
const TAILWIND_COLOURS = [["black", "#000000"], ["white", "#ffffff"]];
/** Source shown in a finding is cut at this many lines. */
const SNIPPET_LINES = 40;

// ---------------------------------------------------------------------------------------------------------------
// Small helpers.

const CODE = /\.(tsx?|jsx?|mjs)$/;
const posix = (path) => path.split(sep).join("/");
const isPlumbing = (file) => /(^|\/)studio-[\w-]+\.(t|j)sx?$/.test(file);
const inDesignSystem = (file) => DS_DIRS.some((dir) => dirname(file) === dir) || dirname(file) === ICON_DIR;
const componentName = (file) => basename(file).replace(/\.\w+$/, "");
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[\s_-]+/).filter(Boolean);

function listFiles(root, dir = root, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listFiles(root, full, found);
    else found.push(posix(relative(root, full)));
  }
  return found;
}

function loadTypescript(dir) {
  for (const from of [join(dir, "package.json"), fileURLToPath(import.meta.url), join(process.cwd(), "package.json")]) {
    try {
      return createRequire(from)("typescript");
    } catch {
      // try the next place
    }
  }
  throw new Error("TypeScript isn't installed in the prototype. Run its install (npm install) first.");
}

// ---------------------------------------------------------------------------------------------------------------
// Scope: which files the final variants render.

const IMPORT = /(?:^|[^\w.])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function aliasRoot(dir) {
  try {
    // tsconfig may carry comments; good enough to strip whole-line ones.
    const text = readFileSync(join(dir, "tsconfig.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
    const target = JSON.parse(text).compilerOptions?.paths?.["@/*"]?.[0];
    if (target) return target.replace(/^\.\//, "").replace(/\*$/, "").replace(/\/$/, "");
  } catch {
    // fall through
  }
  return existsSync(join(dir, "src")) ? "src" : "";
}

function resolveImport(dir, from, spec, alias) {
  let base;
  if (spec.startsWith("@/")) base = posix(join(alias, spec.slice(2)));
  else if (spec.startsWith(".")) base = posix(join(dirname(from), spec));
  else return null; // a package
  for (const candidate of [base, ...[".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"].map((ext) => base + ext), ...["tsx", "ts", "jsx", "js"].map((ext) => `${base}/index.${ext}`)]) {
    const full = join(dir, candidate);
    if (existsSync(full) && statSync(full).isFile()) return candidate;
  }
  return null;
}

export function importsOf(dir, file, alias) {
  const text = readFileSync(join(dir, file), "utf8");
  const found = new Set();
  for (const match of text.matchAll(IMPORT)) {
    const resolved = resolveImport(dir, file, match[1] ?? match[2], alias);
    if (resolved) found.add(resolved);
  }
  return [...found];
}

/** Follows imports from each variant's entries. Returns every live file with the variants that reach it, and the graph. */
export function resolveScope(dir, variants) {
  const alias = aliasRoot(dir);
  const live = new Map();
  const graph = new Map();
  for (const variant of variants) {
    const queue = [...variant.entries];
    for (const entry of queue) {
      if (!existsSync(join(dir, entry))) throw new Error(`No entry file ${entry} in ${dir}.`);
    }
    while (queue.length) {
      const file = queue.shift();
      const reached = live.get(file) ?? new Set();
      if (reached.has(variant.id)) continue;
      reached.add(variant.id);
      live.set(file, reached);
      if (!CODE.test(file)) continue;
      if (!graph.has(file)) graph.set(file, importsOf(dir, file, alias));
      queue.push(...graph.get(file));
    }
  }
  return { live, graph };
}

// ---------------------------------------------------------------------------------------------------------------
// The design system: read with `gh` at the branch's head, or from a local clone if that fails.

function gh(args, input) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, input });
  if (run.error || run.status !== 0) throw new Error((run.stderr || run.error?.message || "gh failed").trim().split("\n")[0]);
  return run.stdout;
}

function fromGithub(wanted) {
  const sha = gh(["api", `repos/${REPO}/commits/${BRANCH}`, "--jq", ".sha"]).trim();
  const paths = gh(["api", `repos/${REPO}/git/trees/${sha}?recursive=1`, "--jq", ".tree[] | select(.type == \"blob\") | .path"]).split("\n").filter(Boolean);
  const exists = new Set(paths);
  const need = [...new Set(wanted(paths))].filter((path) => exists.has(path));
  const texts = new Map();
  const [owner, name] = REPO.split("/");
  // Many files in one GraphQL request rather than one REST call each.
  for (let i = 0; i < need.length; i += 60) {
    const batch = need.slice(i, i + 60);
    const fields = batch.map((path, n) => `f${n}: object(expression: ${JSON.stringify(`${sha}:${path}`)}) { ... on Blob { text } }`).join("\n");
    const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} } }`;
    const data = JSON.parse(gh(["api", "graphql", "-f", `query=${query}`])).data.repository;
    batch.forEach((path, n) => texts.set(path, data[`f${n}`]?.text ?? ""));
  }
  return { source: "github", repo: REPO, ref: BRANCH, sha, paths, texts };
}

function fromClone(clone, wanted, why) {
  const git = (...args) => spawnSync("git", ["-C", clone, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const sha = git("rev-parse", "HEAD").stdout.trim();
  const paths = git("ls-files").stdout.split("\n").filter(Boolean);
  const texts = new Map();
  for (const path of new Set(wanted(paths))) {
    if (existsSync(join(clone, path))) texts.set(path, readFileSync(join(clone, path), "utf8"));
  }
  return { source: "local", repo: REPO, ref: "HEAD", sha, localPath: clone, note: `gh couldn't read ${REPO} (${why}); read from the local clone's working tree.`, paths, texts };
}

export function loadDesignSystem(wanted) {
  try {
    return fromGithub(wanted);
  } catch (error) {
    const clone = LOCAL_CLONES.find((path) => existsSync(join(path, ".git")));
    if (!clone) throw new Error(`Couldn't read the design system: gh failed (${error.message}) and there is no local clone at ${LOCAL_CLONES.join(" or ")}.`);
    return fromClone(clone, wanted, error.message);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reading components with the TypeScript compiler: props, and the classes of every element.

/** A component's props: its `Props` (or `<Name>Props`) type. Ported from the studio's src/lib/registry/design-system.ts, plus each prop's type as written. */
export function propsOf(ts, source, name) {
  const aliases = new Map();
  const members = [];
  const collect = (node) => {
    if (ts.isTypeLiteralNode(node)) members.push(...node.members);
    else if (ts.isIntersectionTypeNode(node)) node.types.forEach(collect);
    else if (ts.isParenthesizedTypeNode(node)) collect(node.type);
  };
  for (const statement of source.statements) if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
  for (const statement of source.statements) {
    const named = (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && (statement.name.text === "Props" || statement.name.text === `${name}Props`);
    if (!named) continue;
    if (ts.isTypeAliasDeclaration(statement)) collect(statement.type);
    else members.push(...statement.members);
  }
  return members.flatMap((member) =>
    ts.isPropertySignature(member) && member.type && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
      ? [{ name: member.name.text, optional: !!member.questionToken, type: member.type.getText(source) }]
      : [],
  );
}

const MAX_ALTS = 16;

/** Every set of classes a className expression can produce (a ternary is two), following variables in the same file. */
function classAlternatives(ts, node, vars, depth = 0) {
  const split = (text) => [text.split(/\s+/).filter(Boolean)];
  const combine = (a, b) => a.flatMap((x) => b.map((y) => [...x, ...y])).slice(0, MAX_ALTS);
  const again = (next) => (depth > 6 ? [[]] : classAlternatives(ts, next, vars, depth + 1));
  if (!node) return [[]];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return split(node.text);
  if (ts.isTemplateExpression(node)) {
    let alts = split(node.head.text);
    for (const span of node.templateSpans) alts = combine(combine(alts, again(span.expression)), split(span.literal.text));
    return alts;
  }
  if (ts.isJsxExpression(node) || ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return again(node.expression);
  if (ts.isConditionalExpression(node)) return [...again(node.whenTrue), ...again(node.whenFalse)].slice(0, MAX_ALTS);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return [[], ...again(node.right)].slice(0, MAX_ALTS);
    if (op === ts.SyntaxKind.PlusToken) return combine(again(node.left), again(node.right));
    return [...again(node.left), ...again(node.right)].slice(0, MAX_ALTS);
  }
  if (ts.isIdentifier(node)) return vars.has(node.text) ? again(vars.get(node.text)) : [[]];
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => (ts.isPropertyAssignment(property) ? again(property.initializer) : [])).slice(0, MAX_ALTS);
  }
  if (ts.isElementAccessExpression(node)) return again(node.expression);
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && vars.has(node.expression.text)) {
    const object = vars.get(node.expression.text);
    const property = ts.isObjectLiteralExpression(object)
      ? object.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText() === node.name.text)
      : null;
    return property ? again(property.initializer) : [[]];
  }
  if (ts.isCallExpression(node)) return node.arguments.reduce((alts, arg) => combine(alts, again(arg)), [[]]);
  return [[]];
}

const isIntrinsic = (tag) => /^[a-z]/.test(tag);
const tagOf = (ts, node) => (ts.isJsxElement(node) ? node.openingElement : node).tagName.getText();
const attributesOf = (ts, node) => (ts.isJsxElement(node) ? node.openingElement : node).attributes.properties;

/** Every intrinsic JSX element in a file, with its class alternatives, line, and the elements inside it. */
export function elementsOf(ts, source) {
  const vars = new Map();
  const visitVars = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && !vars.has(node.name.text)) vars.set(node.name.text, node.initializer);
    ts.forEachChild(node, visitVars);
  };
  visitVars(source);

  const elements = [];
  const visit = (node, parent) => {
    let here = parent;
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && isIntrinsic(tagOf(ts, node))) {
      const className = attributesOf(ts, node).find((attr) => ts.isJsxAttribute(attr) && attr.name.getText() === "className");
      const element = {
        tag: tagOf(ts, node),
        start: node.getStart(source),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        endLine: source.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
        alts: className?.initializer ? classAlternatives(ts, className.initializer, vars) : [[]],
        text: firstText(ts, node),
        children: [],
        parent,
      };
      elements.push(element);
      parent?.children.push(element);
      here = element;
    }
    ts.forEachChild(node, (child) => visit(child, here));
  };
  visit(source, null);
  return elements;
}

/** The first words written inside an element, if any: what tells it apart from another with the same classes. */
function firstText(ts, node) {
  let found;
  const visit = (child) => {
    if (found) return;
    if (ts.isJsxText(child)) {
      const text = child.text.replace(/\s+/g, " ").trim();
      if (/\p{L}{2}/u.test(text)) found = text.slice(0, 60);
    } else ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
}

/**
 * How the studio finds an element in the running page (see the studio's src/lib/handoff-clip.ts): its tag, the classes
 * it has whatever its expressions say (those in every alternative), and the first words inside it. Undefined when that
 * would match too much to mean anything.
 */
export function findOf(element) {
  if (!element) return undefined;
  const classes = element.alts.reduce((a, b) => a.filter((cls) => b.includes(cls))).filter((cls) => !/[{}$]/.test(cls));
  // A landmark (a page's one footer, its nav) is found by its tag alone.
  if (!classes.length && !element.text && !LANDMARKS.has(element.tag)) return undefined;
  return { tag: element.tag, classes, ...(element.text ? { text: element.text } : {}) };
}

const LANDMARKS = new Set(["header", "footer", "nav", "main", "aside"]);

/**
 * A component's outermost element of its own: inside the function named after it (or exported by default), the
 * biggest of the elements not inside another of its elements, which is what it returns rather than a piece it keeps
 * in a variable.
 */
export function rootOf(ts, source, elements, name) {
  let fn;
  const visit = (node) => {
    if (fn) return;
    const named =
      (ts.isFunctionDeclaration(node) && (node.name?.text === name || node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword))) ||
      (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer) || ts.isCallExpression(node.initializer)));
    if (named) fn = node;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  if (!fn) return elements[0];
  const inside = (element) => element && element.start >= fn.getStart(source) && element.start < fn.getEnd();
  return elements.filter((element) => inside(element) && !inside(element.parent)).sort((a, b) => b.endLine - b.line - (a.endLine - a.line))[0];
}

/** What the studio can stand in for when it draws a design-system component on its own: anything else it imports means it can't. */
const RENDERABLE_IMPORTS = new Set(["react", "react-dom", "next/link", "next/image", "@/components/icons", "clsx", "classnames"]);
/** A component's file this long is too much to send to the studio to draw. */
const MAX_MODULE = 30000;

/**
 * A design-system component compiled for the studio to draw beside the prototype's own (React.createElement, CommonJS):
 * only when everything it needs at run time is something the studio stands in for. Types are compiled away, so a type
 * imported from anywhere doesn't count.
 */
export function moduleOf(ts, path, text) {
  const out = ts.transpileModule(text, {
    fileName: path,
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const needs = [...out.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
  return out.length <= MAX_MODULE && needs.every((need) => RENDERABLE_IMPORTS.has(need)) ? out : undefined;
}

/** What the studio stands in for when it draws a component on its own, by the name it is imported under. */
const STOOD_IN = new Set(["react", "react-dom", "next/link", "next/image", "next/navigation", "next/dynamic", "@/components/icons", "@/lib/studio-controls", "clsx", "classnames"]);
/** A component and everything it imports this long is too much to send to the studio to draw. */
const MAX_BUNDLE = 200000;

/**
 * A component from the prototype's own files, with every file of the prototype it imports, compiled into one script
 * (CommonJS) the studio can draw on its own. That is what lets it show a component that is only on screen after a tap
 * (a sheet, a drawer), and the design-system copy the prototype already carries. Packages the studio doesn't stand in
 * for mean it can't be drawn: no bundle.
 */
export function bundleOf(ts, dir, entry, alias = aliasRoot(dir)) {
  const ids = new Map();
  const code = new Map();
  let drawable = true;
  const idOf = (path) => {
    if (!ids.has(path)) ids.set(path, String(ids.size));
    return ids.get(path);
  };
  const visit = (path) => {
    if (code.has(path) || !drawable) return;
    code.set(path, "");
    const text = readFileSync(join(dir, path), "utf8");
    if (path.endsWith(".json")) {
      code.set(path, `module.exports = ${text};`);
      return;
    }
    const out = ts.transpileModule(text, {
      fileName: path,
      compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
    }).outputText;
    code.set(
      path,
      out.replace(/require\("([^"]+)"\)/g, (whole, spec) => {
        if (STOOD_IN.has(spec)) return whole;
        const resolved = resolveImport(dir, path, spec, alias);
        if (!resolved) {
          drawable = false;
          return whole;
        }
        if (/\.(css|scss|svg|png|jpe?g|webp|gif|avif|ico|woff2?)$/i.test(resolved)) return "({})";
        visit(resolved);
        return `__req("${idOf(resolved)}")`;
      }),
    );
  };
  idOf(entry);
  visit(entry);
  if (!drawable) return undefined;
  const defs = [...code].map(([path, body]) => `__defs["${idOf(path)}"] = function (module, exports, require) {\n${body}\n};`).join("\n");
  const script = `var __defs = {}, __cache = {};\nfunction __req(id) { var c = __cache[id]; if (c) return c.exports; var m = { exports: {} }; __cache[id] = m; __defs[id].call(m.exports, m, m.exports, require); return m.exports; }\n${defs}\nmodule.exports = __req("${idOf(entry)}");`;
  return script.length <= MAX_BUNDLE ? script : undefined;
}

/**
 * The prototype's look, for drawing a design-system component the way the prototype would: its globals.css without
 * the Tailwind import (the studio brings its own), and the local fonts its layout loads, as files under public/.
 */
export function themeOf(dir) {
  const app = ["src/app", "app"].find((folder) => existsSync(join(dir, folder, "globals.css")));
  if (!app) return undefined;
  const css = readFileSync(join(dir, app, "globals.css"), "utf8").replace(/^\s*@(import|plugin|source|config)\b[^;]*;\s*$/gm, "");
  const layout = ["layout.tsx", "layout.jsx", "layout.js"].map((file) => join(dir, app, file)).find(existsSync);
  const fonts = [];
  if (layout) {
    for (const [, body, variable] of readFileSync(layout, "utf8").matchAll(/localFont\(\{([\s\S]*?)variable:\s*["'](--[\w-]+)["']/g)) {
      for (const [, path, rest] of body.matchAll(/path:\s*["']([^"']+)["']([^}]*)\}/g)) {
        const file = path.split("/public/")[1];
        if (file) fonts.push({ variable, file, weight: rest.match(/weight:\s*["'](\d+)["']/)?.[1] ?? "400", style: rest.match(/style:\s*["'](\w+)["']/)?.[1] ?? "normal" });
      }
    }
  }
  return { css: css.slice(0, 100000), fonts };
}

/** Whether a file renders anything: any JSX at all, a component's own elements or other components. */
function hasJsx(ts, source) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) found = true;
    else ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * Generic: none of its props is typed with something from its own feature (a type imported from a relative path,
 * such as `Bundle` from ./bundles). A component that takes strings, numbers, callbacks and slots can go anywhere.
 */
function isGeneric(ts, source, props) {
  const local = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier.text.startsWith(".")) continue;
    const clause = statement.importClause;
    if (clause?.name) local.add(clause.name.text);
    if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) clause.namedBindings.elements.forEach((item) => local.add(item.name.text));
  }
  return props.every((prop) => !(prop.type.match(/[A-Za-z_]\w*/g) ?? []).some((word) => local.has(word)));
}
const SLOT = /ReactNode|ReactElement|JSX\.Element/;

const descendants = (element) => element.children.flatMap((child) => [child, ...descendants(child)]);

// A class's feature: the look is kept exactly (bg-dark/6, rounded-[14px]); layout keeps only its property (px-3 → px).
const LOOK = /^(rounded|bg-|text-|font-|border|shadow|tracking-|leading-|uppercase|lowercase|capitalize|italic|underline|opacity-|ring|outline|from-|to-|via-)/;
function feature(cls) {
  const bare = cls.split(":").pop().replace(/^!|!$/g, "");
  if (!bare || /[{}$]/.test(bare)) return null;
  if (LOOK.test(bare)) return { key: bare, weight: LOOK_WEIGHT };
  return { key: bare.replace(/-(-?[\d.]+(\/[\d.]+)?|\[[^\]]*\]|px|full|screen|auto)$/, ""), weight: LAYOUT_WEIGHT };
}
function features(classes) {
  const found = new Map();
  for (const cls of classes) {
    const f = feature(cls);
    if (f) found.set(f.key, f.weight);
  }
  return found;
}
function weightedJaccard(a, b) {
  let shared = 0;
  let all = 0;
  for (const [key, weight] of a) {
    all += weight;
    if (b.has(key)) shared += weight;
  }
  for (const [key, weight] of b) if (!a.has(key)) all += weight;
  return all ? shared / all : 0;
}
const union = (sets) => new Map(sets.flatMap((set) => [...set]));
const allClasses = (element) => [element, ...descendants(element)].flatMap((item) => item.alts.flat());
const nameSim = (a, b) => {
  const x = new Set(words(a));
  const y = new Set(words(b));
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / (new Set([...x, ...y]).size || 1);
};

/** How much an element of `mine` looks like a design-system component (see the WEIGHTS and thresholds above). */
export function matchScore(element, myName, component) {
  let root = 0;
  let look = 0;
  let best = { mine: element.alts[0] ?? [], theirs: component.root.alts[0] ?? [] };
  for (const mine of element.alts) {
    for (const theirs of component.root.alts) {
      const [a, b] = [features(mine), features(theirs)];
      const score = weightedJaccard(a, b);
      if (score > root) [root, best, look] = [score, { mine, theirs }, [...a.keys()].filter((key) => a.get(key) === LOOK_WEIGHT && b.has(key)).length];
    }
  }
  const sub = weightedJaccard(features(allClasses(element)), component.features);
  const n = 1 + descendants(element).length;
  const structure = 1 - Math.abs(n - component.count) / Math.max(n, component.count);
  const classes = 0.6 * root + 0.4 * sub;
  const score = WEIGHTS.classes * classes + WEIGHTS.structure * structure + WEIGHTS.name * nameSim(myName, component.name);
  return { score: Math.round(score * 100) / 100, root, look, best, n };
}

// ---------------------------------------------------------------------------------------------------------------
// Colours.

const HEX = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])/g;
const RGB = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/g;

export function parseColour(text) {
  const hex = text.match(/^#([0-9a-f]+)$/i);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  const rgb = text.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
    return { r: Math.round(+rgb[1]), g: Math.round(+rgb[2]), b: Math.round(+rgb[3]), a: alpha };
  }
  return null;
}

export const toHex = ({ r, g, b }) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

function toLab({ r, g, b }) {
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const xyz = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883];
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [x, y, z] = xyz.map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76: the straight-line distance between two colours in Lab. */
export function deltaE(a, b) {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** The colour tokens in the `@theme inline` block of the repository's globals.css, with `var()`s resolved from `:root`. */
export function parseTokens(css) {
  const roots = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const theme = css.match(/@theme\s+inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const tokens = [];
  for (const [, name, raw] of theme.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
    let value = raw.trim();
    for (let i = 0; i < 4 && value.startsWith("var("); i++) value = roots.get(value.match(/var\((--[\w-]+)/)?.[1]) ?? value;
    const colour = parseColour(value);
    if (colour) tokens.push({ name, value: value.toLowerCase(), colour });
  }
  for (const [name, value] of TAILWIND_COLOURS) if (!tokens.some((token) => token.name === name)) tokens.push({ name, value, colour: parseColour(value) });
  return tokens;
}

/** Every literal colour in a file's strings, with where it is. Comments are not strings, so they are skipped. */
export function coloursOf(ts, source, file) {
  const found = [];
  const contextOf = (node, offset) => {
    // Inside a class list: the class it is in. Otherwise the property, attribute or variable it is assigned to.
    const text = node.text ?? "";
    const before = text.slice(0, offset).split(/\s/).pop();
    const after = text.slice(offset).split(/\s/)[0];
    if (before && /[[-]$/.test(before)) return before + after;
    for (let up = node.parent; up; up = up.parent) {
      if (ts.isPropertyAssignment(up) || ts.isJsxAttribute(up) || ts.isVariableDeclaration(up)) return up.name.getText(source);
    }
    return undefined;
  };
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      const text = node.text ?? "";
      for (const pattern of [HEX, RGB]) {
        for (const match of text.matchAll(pattern)) {
          const colour = parseColour(match[0]);
          if (!colour) continue;
          const at = node.getStart(source) + 1 + match.index;
          found.push({ written: match[0], colour, file, line: source.getLineAndCharacterOfPosition(at).line + 1, selector: contextOf(node, match.index) });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// The scan.

/**
 * FINDING, one shape for every rule:
 *   { id, rule, kind, where: [{ file, line, selector?, variants? }], mine: {...}, candidates: [{ name, source, score, differences? }],
 *     tier: "exact" | "near" | "none", proposed: { summary, ... }, decision: null }
 * `decision` is filled in by the designer in the studio: { action: "approve" | "pick" | "add" | "exception", candidate?, name?, reason?, by, at }.
 */
// ---------------------------------------------------------------------------------------------------------------
// What the team's kits provide: not the designer's to decide.

/** The team's starter, kits and templates, where /newprototype copies a prototype's first files from. */
export const TEAM_CONVENTIONS = join(homedir(), "Claude", "team-conventions");

/**
 * Every file the starter, the kits (`optional-stubs/<kit>/src`) and the templates carry, by the path it has in a
 * prototype (`src/...`), with the text each version of it has. A live file that is byte for byte one of these came with
 * the prototype: whoever made it didn't write it, so there is nothing for them to decide about it. Without the folder
 * (a machine that doesn't have it) there is no baseline and every file is judged on its own.
 */
export function kitBaseline(root = TEAM_CONVENTIONS) {
  const texts = new Map();
  const add = (base) => {
    if (!existsSync(base)) return;
    const walk = (folder) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const full = join(folder, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?|css|json)$/.test(entry.name)) {
          const key = posix(join("src", relative(base, full)));
          (texts.get(key) ?? texts.set(key, new Set()).get(key)).add(readFileSync(full, "utf8"));
        }
      }
    };
    walk(base);
  };
  add(join(root, "starter", "src"));
  const stubs = join(root, "starter", "optional-stubs");
  if (existsSync(stubs)) for (const kit of readdirSync(stubs, { withFileTypes: true })) if (kit.isDirectory()) add(join(stubs, kit.name, "src"));
  const templates = join(root, "templates");
  if (existsSync(templates)) for (const template of readdirSync(templates, { withFileTypes: true })) if (template.isDirectory()) add(join(templates, template.name, "src"));
  return texts;
}

/** The production commit the prototype's copies of the shared UI were taken from (`.design-system.json`, written by the sync), if it says. */
function copiedFrom(dir) {
  try {
    const sha = JSON.parse(readFileSync(join(dir, ".design-system.json"), "utf8")).sha;
    return typeof sha === "string" ? { copiedFrom: sha } : {};
  } catch {
    return {};
  }
}

export function scan({ dir: dirArg, variants: wantedVariants, by }) {
  const dir = resolve(dirArg);
  const ts = loadTypescript(dir);

  // Variants: the control marked "variants" in public/studio.json names them.
  const studio = existsSync(join(dir, "public", "studio.json")) ? JSON.parse(readFileSync(join(dir, "public", "studio.json"), "utf8")) : {};
  const control = (studio.controls ?? []).find((item) => item.variants);
  const variants = wantedVariants.map(({ id, entries }) => {
    const option = control?.options?.find((item) => item.value === id);
    if (control && !option) throw new Error(`"${id}" isn't one of the ${control.label ?? control.id} options: ${control.options.map((item) => item.value).join(", ")}.`);
    return { id, label: option?.label ?? id, entries: entries.map(posix) };
  });
  if (!variants.length) throw new Error("Name at least one final variant: --variant <option>=<entry file>,<entry file>.");

  const { live, graph } = resolveScope(dir, variants);
  const variantsOf = (file) => [...(live.get(file) ?? [])];
  const allFiles = existsSync(join(dir, "src")) ? listFiles(dir, join(dir, "src")) : listFiles(dir);
  const liveFiles = [...live.keys()].filter((file) => CODE.test(file) || file.endsWith(".css")).sort();

  // What to read from the repository: the design system, its tokens, and whatever a live file has the same path or name as.
  const wanted = (paths) => {
    const byName = new Map();
    for (const path of paths) if (/\.tsx$/.test(path) && !/\.(test|stories)\.tsx$/.test(path)) byName.set(basename(path), [...(byName.get(basename(path)) ?? []), path]);
    return [
      TOKENS_FILE,
      ...paths.filter((path) => (DS_DIRS.includes(dirname(path)) || dirname(path) === ICON_DIR) && /\.tsx?$/.test(path) && !/\.(test|stories)\.tsx?$/.test(path)),
      ...liveFiles.flatMap((file) => [file, ...(/^[A-Z]\w*\.tsx$/.test(basename(file)) ? (byName.get(basename(file)) ?? []) : [])]),
    ];
  };
  const ds = loadDesignSystem(wanted);
  const repoText = (path) => ds.texts.get(path);
  // What the studio draws: the prototype's own file (with what it imports), or for a design-system component the copy the
  // prototype already carries when it has one (it brings its own hooks and icons), else the repo's file on its own.
  const drawn = (file) => {
    try {
      return bundleOf(ts, dir, file);
    } catch {
      return undefined;
    }
  };
  const sameAsRepo = (path, text) => {
    try {
      return readFileSync(join(dir, path), "utf8") === text;
    } catch {
      return false;
    }
  };
  // Only a copy that is the repo's file to the byte stands for it: an edited one or a stand-in is the prototype's own, not the match.
  const moduleFor = (path, text) => (sameAsRepo(path, text) ? drawn(path) : undefined) ?? moduleOf(ts, path, text);
  const dsSource = (path) => `${REPO}@${ds.sha.slice(0, 7)}:${path}`;
  const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const snippet = (text, from = 1, to = Infinity) => {
    const lines = text.split("\n").slice(from - 1, Math.min(to, from - 1 + SNIPPET_LINES));
    return lines.join("\n") + (to - from + 1 > SNIPPET_LINES && to !== Infinity ? "\n…" : "");
  };

  const findRoot = (file, text) => {
    const source = parse(file, text);
    return findOf(rootOf(ts, source, elementsOf(ts, source), componentName(file)));
  };

  // The design system's components, read once: their root element's classes, all their classes, how many elements, their props.
  const components = [...ds.texts.keys()]
    .filter((path) => DS_DIRS.includes(dirname(path)) && path.endsWith(".tsx"))
    .flatMap((path) => {
      const source = parse(path, ds.texts.get(path));
      const elements = elementsOf(ts, source);
      if (!elements.length) return [];
      const name = componentName(path);
      return [{
        name,
        path,
        root: elements[0],
        count: elements.length,
        features: features(elements.flatMap((element) => element.alts.flat())),
        props: propsOf(ts, source, name),
        code: snippet(ds.texts.get(path)),
        module: moduleFor(path, ds.texts.get(path)),
      }];
    });

  // Sort the live files into what they are.
  const roles = new Map();
  const findings = [];
  const repoMatchOf = (file) => {
    if (repoText(file) !== undefined) return file;
    if (!/^[A-Z]\w*\.tsx$/.test(basename(file))) return null;
    const same = [...ds.texts.keys()].filter((path) => basename(path) === basename(file) && !inDesignSystem(path));
    return same[0] ?? null;
  };
  const lineSimilarity = (a, b) => {
    const x = new Set(a.split("\n").map((line) => line.trim()).filter(Boolean));
    const y = new Set(b.split("\n").map((line) => line.trim()).filter(Boolean));
    return Math.round(((2 * [...x].filter((line) => y.has(line)).length) / (x.size + y.size || 1)) * 100) / 100;
  };
  const usesOf = (file) => {
    // Where it is rendered: each <Name in another live file (directly or through a barrel such as icons/index.ts).
    const name = componentName(file);
    return liveFiles
      .filter((other) => other !== file)
      .map((other) => ({ file: other, count: (readFileSync(join(dir, other), "utf8").match(new RegExp(`<${name}[\\s/>]`, "g")) ?? []).length }))
      .filter((use) => use.count > 0);
  };
  const entries = new Set(variants.flatMap((variant) => variant.entries));

  for (const file of liveFiles) {
    const text = readFileSync(join(dir, file), "utf8");
    if (isPlumbing(file)) {
      roles.set(file, "plumbing");
      continue;
    }
    const match = repoMatchOf(file);
    if (match && repoText(match) === text) {
      roles.set(file, inDesignSystem(file) ? "design-system" : "repo-copy");
      continue;
    }
    const isComponent = /\.(t|j)sx$/.test(file) && hasJsx(ts, parse(file, text));
    if (inDesignSystem(file) && match === file) {
      // A design-system copy that isn't the same as production's: edited here, or production has moved on since it was copied.
      if (!isComponent) {
        roles.set(file, "supporting");
        continue;
      }
      roles.set(file, "edited-design-system");
      findings.push({
        id: `components:near-match:${file}:${componentName(match)}`,
        rule: "components",
        kind: "near-match",
        where: [{ file, line: 1, variants: variantsOf(file) }],
        mine: { name: componentName(file), file, code: snippet(text), props: propsOf(ts, parse(file, text), componentName(file)), edited: true, find: findRoot(file, text), module: drawn(file) },
        candidates: [{
          name: componentName(match),
          source: dsSource(match),
          score: lineSimilarity(text, repoText(match)),
          props: propsOf(ts, parse(match, repoText(match)), componentName(match)),
          code: snippet(repoText(match)),
          module: moduleFor(match, repoText(match)),
          differences: [`the prototype's copy differs from production's (${Math.round(lineSimilarity(text, repoText(match)) * 100)}% of lines in common): edited here, or changed in production since it was copied`],
        }],
        tier: "near",
        proposed: { summary: `Use production's ${match} as it is. If the difference is a design change, make it a prop or a wrapper rather than an edit to the component.`, use: componentName(match) },
        decision: null,
      });
      continue;
    }
    if (match && isComponent) {
      roles.set(file, "stand-in");
      const source = parse(file, text);
      const mine = propsOf(ts, source, componentName(file));
      const theirs = propsOf(ts, parse(match, repoText(match)), componentName(file));
      const added = mine.filter((prop) => !theirs.some((item) => item.name === prop.name));
      const removed = theirs.filter((prop) => !mine.some((item) => item.name === prop.name));
      const similarity = lineSimilarity(text, repoText(match));
      findings.push({
        id: `components:stand-in:${file}`,
        rule: "components",
        kind: "stand-in",
        where: [{ file, line: 1, variants: variantsOf(file) }],
        mine: {
          name: componentName(file),
          file,
          code: snippet(text),
          props: mine,
          addedProps: added.map((prop) => ({ ...prop, slot: SLOT.test(prop.type) })),
          removedProps: removed,
          similarity,
          find: findRoot(file, text),
          module: drawn(file),
        },
        candidates: [{ name: componentName(match), source: dsSource(match), score: similarity, props: theirs, code: snippet(repoText(match)), module: moduleFor(match, repoText(match)), differences: [
          `${Math.round(similarity * 100)}% of lines in common with production`,
          ...added.map((prop) => `adds ${prop.name}${prop.optional ? "?" : ""}: ${prop.type}`),
          ...removed.map((prop) => `drops ${prop.name}`),
        ] }],
        tier: "none",
        proposed: {
          summary: `Don't lift ${file}: production's ${match} stays. ${added.length ? `It needs ${added.map((prop) => prop.name).join(", ")} added for this design.` : "It needs the changes this prototype made to it."}`,
          keep: match,
          addProps: added.map((prop) => prop.name),
        },
        decision: null,
      });
      continue;
    }
    roles.set(file, isComponent ? "new" : "supporting");
  }

  // What came with the prototype (the starter, a kit, a template) and hasn't been touched is not the designer's to decide:
  // listed for engineering with how it differs from production, never reviewed, and never judged for colours.
  const baseline = kitBaseline();
  const came = (file) => baseline.get(file)?.has(readFileSync(join(dir, file), "utf8")) ?? false;
  const kit = [];
  for (const finding of [...findings]) {
    const file = finding.mine?.file;
    if (finding.rule !== "components" || !file || !(finding.kind === "stand-in" || (finding.kind === "near-match" && finding.mine.edited)) || !came(file)) continue;
    const candidate = finding.candidates[0];
    kit.push({
      name: finding.mine.name,
      file,
      production: candidate ? String(candidate.source).split(":").slice(1).join(":") : undefined,
      // A stand-in is a front-end version of production's; "behind" is a copy of production's that production has since changed.
      kind: finding.kind === "stand-in" ? "stand-in" : "behind",
      similarity: candidate?.score ?? finding.mine.similarity,
      addedProps: finding.mine.addedProps ?? [],
      removedProps: finding.mine.removedProps ?? [],
      ...(finding.mine.find ? { find: finding.mine.find } : {}),
    });
    findings.splice(findings.indexOf(finding), 1);
    roles.set(file, "kit");
  }
  for (const file of liveFiles) if (roles.get(file) !== "kit" && roles.get(file) !== "plumbing" && came(file)) roles.set(file, roles.get(file) === "design-system" || roles.get(file) === "repo-copy" ? roles.get(file) : "kit");

  // What a component is built from: each component it renders that comes from the prototype's own files, and what that is:
  // the design system as production has it, the design system behind production's, a kit's, a stand-in, or the prototype's own.
  const aliasDir = aliasRoot(dir);
  // Each file drawn for a "Built from" is kept once, here, whoever uses it.
  const modules = {};
  const pages = [];
  const kitByFile = new Map(kit.map((item) => [item.file, item]));
  const builtFromOf = (file) => {
    const source = parse(file, readFileSync(join(dir, file), "utf8"));
    const imported = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.importClause || statement.importClause.isTypeOnly) continue;
      const clause = statement.importClause;
      if (clause.name) imported.set(clause.name.text, statement.moduleSpecifier.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) if (!item.isTypeOnly) imported.set(item.name.text, statement.moduleSpecifier.text);
    }
    const used = new Map();
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(source).split(".")[0];
        if (/^[A-Z]/.test(name)) used.set(name, (used.get(name) ?? 0) + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const out = [];
    for (const [name, count] of used) {
      const spec = imported.get(name);
      if (!spec || !(spec.startsWith(".") || spec.startsWith("@/")) || spec.endsWith("components/icons")) continue;
      const resolved = resolveImport(dir, file, spec, aliasDir);
      const role = resolved ? roles.get(resolved) : undefined;
      if (!resolved || !role) continue;
      const from =
        role === "design-system" || role === "repo-copy" ? "design-system"
        : role === "edited-design-system" ? "design-system-behind"
        : role === "kit" ? (kitByFile.get(resolved)?.kind === "behind" ? "design-system-behind" : "kit")
        : role === "stand-in" ? "stand-in"
        : role === "new" || role === "supporting" ? "own"
        : null;
      if (!from) continue;
      let props = [];
      try {
        props = propsOf(ts, parse(resolved, readFileSync(join(dir, resolved), "utf8")), name);
      } catch {
        // No props to give examples from: drawn without.
      }
      if (!(resolved in modules)) {
        const code = drawn(resolved);
        if (code) modules[resolved] = code;
      }
      out.push({ name, file: resolved, from, count, importPath: spec, props });
    }
    return out.slice(0, 8);
  };

  // Near-matches: elements of the prototype's own components that re-implement a design-system component.
  const own = liveFiles.filter((file) => roles.get(file) === "new");
  const parsed = new Map(own.map((file) => {
    const text = readFileSync(join(dir, file), "utf8");
    const source = parse(file, text);
    return [file, { text, source, elements: elementsOf(ts, source), props: propsOf(ts, source, componentName(file)) }];
  }));
  for (const file of own) {
    const { text, elements, props } = parsed.get(file);
    const byComponent = new Map();
    for (const element of elements) {
      const scored = components
        .map((component) => ({ component, ...matchScore(element, componentName(file), component) }))
        .filter((item) => item.root >= ROOT_MIN && item.look >= LOOK_MIN)
        .sort((a, b) => b.score - a.score);
      const best = scored[0];
      if (!best || best.score < NEAR_MATCH) continue;
      // An element inside one already matched to the same component is part of that match.
      if (byComponent.get(best.component.name)?.some((hit) => descendants(hit.element).includes(element))) continue;
      byComponent.set(best.component.name, [...(byComponent.get(best.component.name) ?? []), { element, best, scored }]);
    }
    for (const [name, hits] of byComponent) {
      const top = hits.reduce((a, b) => (b.best.score > a.best.score ? b : a));
      const component = top.best.component;
      const onlyMine = top.best.best.mine.filter((cls) => !top.best.best.theirs.includes(cls));
      const onlyTheirs = top.best.best.theirs.filter((cls) => !top.best.best.mine.includes(cls));
      findings.push({
        id: `components:near-match:${file}:${name}`,
        rule: "components",
        kind: "near-match",
        where: hits.map((hit) => ({ file, line: hit.element.line, selector: `<${hit.element.tag}>`, variants: variantsOf(file) })),
        mine: {
          name: componentName(file),
          file,
          element: `<${top.element.tag}>`,
          line: top.element.line,
          code: snippet(text, top.element.line, top.element.endLine),
          classes: top.best.best.mine,
          elements: top.best.n,
          props,
          find: findOf(top.element),
          // Where the page doesn't show the element (a sheet that opens on a tap), the component it is in is drawn on its own.
          module: drawn(file),
        },
        candidates: top.scored.filter((item) => item.score >= CANDIDATE_MIN).slice(0, MAX_CANDIDATES).map((item) => ({
          name: item.component.name,
          source: dsSource(item.component.path),
          score: item.score,
          props: item.component.props,
          code: item.component.code,
          module: item.component.module,
          classes: item.best.theirs,
          differences: item.component.name === name
            ? [
                ...(onlyMine.length ? [`only in mine: ${onlyMine.join(" ")}`] : []),
                ...(onlyTheirs.length ? [`only in ${name}: ${onlyTheirs.join(" ")}`] : []),
                `${top.best.n} element${top.best.n === 1 ? "" : "s"} here, ${component.count} in ${name}`,
              ]
            : undefined,
        })),
        tier: "near",
        proposed: { summary: `Use <${name}> from ${component.path} for the ${hits.length === 1 ? `<${top.element.tag}> at line ${top.element.line}` : `${hits.length} elements at lines ${hits.map((hit) => hit.element.line).join(", ")}`} instead of rebuilding it.`, use: name },
        decision: null,
      });
    }
  }

  // Each of the prototype's own components: reusable, or part of the feature. Duplicates of each other are flagged.
  const fileFeatures = new Map(own.map((file) => [file, features(parsed.get(file).elements.flatMap((element) => element.alts.flat()))]));
  for (const file of own) {
    // A variant's entry (the page) is where the design is put together, not a part to decide on: its "Built from" is listed as the page's.
    if (entries.has(file)) {
      pages.push({ file, name: componentName(file), variants: variantsOf(file), builtFrom: builtFromOf(file) });
      continue;
    }
    const name = componentName(file);
    const uses = usesOf(file);
    const count = uses.reduce((sum, use) => sum + use.count, 0);
    const duplicates = own
      .filter((other) => other !== file)
      .map((other) => {
        const a = parsed.get(file).elements.length;
        const b = parsed.get(other).elements.length;
        const score = 0.6 * weightedJaccard(fileFeatures.get(file), fileFeatures.get(other)) + 0.25 * (1 - Math.abs(a - b) / Math.max(a, b)) + 0.15 * nameSim(name, componentName(other));
        return { file: other, score: Math.round(score * 100) / 100 };
      })
      .filter((item) => item.score >= DUPLICATE);
    // Reusable: generic, and rendered from two places or a container that takes what it shows as a slot (a sheet, a
    // collapse). An entry is the variant's page, so it stays with the feature; a new file in a design-system folder was
    // put in the system on purpose.
    const { source, props } = parsed.get(file);
    const generic = isGeneric(ts, source, props);
    const slot = props.some((prop) => SLOT.test(prop.type));
    const reusable = inDesignSystem(file) || (!entries.has(file) && (duplicates.length > 0 || (generic && (count >= REUSE_MIN_USES || slot))));
    findings.push({
      id: `components:${reusable ? "new-reusable" : "feature-only"}:${file}`,
      rule: "components",
      kind: reusable ? "new-reusable" : "feature-only",
      where: [{ file, line: 1, variants: variantsOf(file) }],
      mine: { name, file, code: snippet(parsed.get(file).text), props, uses, useCount: count, duplicates, generic, entry: entries.has(file), find: findOf(rootOf(ts, source, parsed.get(file).elements, name)), module: drawn(file), builtFrom: builtFromOf(file) },
      candidates: [],
      tier: "none",
      proposed: reusable
        ? { summary: `Add <${name}> to the system (src/components/shared/${name}.tsx): it is rendered in ${count} place${count === 1 ? "" : "s"}.${duplicates.length ? ` Merge it with ${duplicates.map((item) => componentName(item.file)).join(", ")}, which look the same.` : ""}`, add: name }
        : { summary: `Keep <${name}> with the feature, in ${dirname(file)}/. Nothing to add to the system.`, keep: file },
      decision: null,
    });
  }

  // Colours: every literal one in the live files the prototype wrote (not unedited copies), one finding per colour.
  const tokens = parseTokens(repoText(TOKENS_FILE) ?? "");
  const byColour = new Map();
  for (const file of liveFiles.filter((item) => !["design-system", "repo-copy", "plumbing", "kit"].includes(roles.get(item)))) {
    if (!CODE.test(file)) continue;
    for (const hit of coloursOf(ts, parse(file, readFileSync(join(dir, file), "utf8")), file)) {
      const key = hit.colour.a < 1 ? `${toHex(hit.colour)}/${Math.round(hit.colour.a * 100)}` : toHex(hit.colour);
      byColour.set(key, [...(byColour.get(key) ?? []), hit]);
    }
  }
  for (const [key, hits] of byColour) {
    const colour = hits[0].colour;
    const ranked = tokens.map((token) => ({ token, distance: deltaE(colour, token.colour) })).sort((a, b) => a.distance - b.distance);
    const closest = ranked[0];
    const tier = !closest ? "none" : closest.distance < 0.5 ? "exact" : closest.distance <= NEAR_DELTA_E ? "near" : "none";
    const opacity = colour.a < 1 ? `/${Math.round(colour.a * 100)}` : "";
    const hex = toHex(colour);
    findings.push({
      id: `colours:${key}`,
      rule: "colours",
      kind: "colour",
      where: hits.map((hit) => ({ file: hit.file, line: hit.line, selector: hit.selector, variants: variantsOf(hit.file) })),
      mine: { value: key, hex, alpha: colour.a, written: [...new Set(hits.map((hit) => hit.written))] },
      candidates: ranked.slice(0, MAX_CANDIDATES).map(({ token, distance }) => ({
        name: `${token.name}${opacity}`,
        source: dsSource(`${TOKENS_FILE} --color-${token.name}`),
        score: Math.round(Math.max(0, 1 - distance / 100) * 100) / 100,
        value: toHex(token.colour),
        differences: [distance < 0.5 ? "the same colour" : `ΔE ${distance.toFixed(1)}`],
      })),
      tier,
      proposed:
        tier === "none"
          ? { summary: `No token is close to ${hex}${opacity}. Add it to the system, or keep it as an exception.` }
          : { summary: `Use the ${closest.token.name}${opacity} token (bg-${closest.token.name}${opacity}, text-${closest.token.name}${opacity}, …) instead of ${hits[0].written}${tier === "near" ? `, ΔE ${closest.distance.toFixed(1)} away` : ""}.`, use: `${closest.token.name}${opacity}` },
      decision: null,
    });
  }

  // TODO(lift) markers: the data and copy an engineer has to wire up.
  const lift = liveFiles.flatMap((file) =>
    readFileSync(join(dir, file), "utf8")
      .split("\n")
      .flatMap((line, i) => (line.includes("TODO(lift)") ? [{ file, line: i + 1, text: line.trim().replace(/^(\/\/|\{?\/\*)\s*|\s*(\*\/\}?)$/g, "") }] : [])),
  );

  const liveSet = new Set(liveFiles);
  // The app's own shell (app/: the layout, the page that switches variants, its styles) is the prototype's, never handed off as a feature.
  const shell = (file) => /^(src\/)?app\//.test(file);
  const dropped = allFiles.filter((file) => (CODE.test(file) || file.endsWith(".css")) && !liveSet.has(file) && !inDesignSystem(file) && !isPlumbing(file) && !shell(file)).sort();
  // Only what is rendered: a barrel (icons/index.ts) makes every icon reachable, but only the ones drawn are used.
  const designSystemUsed = liveFiles
    .filter((file) => roles.get(file) === "design-system")
    .map((file) => ({ name: componentName(file), file, usedBy: usesOf(file).map((use) => use.file) }))
    .filter((item) => item.usedBy.length);

  return {
    schema: 1,
    prototype: null,
    scannedAt: new Date().toISOString(),
    scannedBy: by,
    designSystem: { repo: ds.repo, ref: ds.ref, sha: ds.sha, source: ds.source, ...(ds.localPath ? { localPath: ds.localPath, note: ds.note } : {}), ...copiedFrom(dir) },
    scope: {
      variants,
      live: liveFiles.map((file) => ({ file, role: roles.get(file), variants: variantsOf(file) })),
      // What each live file was when this was scanned: /push compares, to say what changed after the handoff was made.
      // Which live file imports which: engineers' agents are given a part and what it pulls in, not the whole prototype.
      // The elements the prototype's own components draw, as [line, last line, tag, classes it always has, its first words]:
      // what an element picked in the page is matched to, to say which lines of which file draw it.
      elements: Object.fromEntries(
        own.flatMap((file) => {
          const rows = parsed.get(file).elements.flatMap((element) => {
            const found = findOf(element);
            return found ? [[element.line, element.endLine, found.tag, found.classes.join(" "), found.text ?? ""]] : [];
          });
          return rows.length ? [[file, rows.slice(0, 600)]] : [];
        }),
      ),
      graph: Object.fromEntries(liveFiles.map((file) => [file, [...(graph.get(file) ?? [])].filter((other) => live.has(other))])),
      hashes: Object.fromEntries(liveFiles.map((file) => [file, createHash("sha1").update(readFileSync(join(dir, file))).digest("hex")])),
      dropped,
      designSystem: designSystemUsed,
    },
    findings,
    lift,
    kit,
    pages,
    modules,
    theme: themeOf(dir),
    signOff: null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Exact colours, fixed before the review.

/** The prototype's own files: the only ones a handoff changes. Copies of production's (the design system, stand-ins) are never edited. */
const OWN = new Set(["new", "supporting"]);
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the exact colours in a scan would become: a class with the colour written in it (`border-[#bdb3a9]`,
 * `bg-[rgba(0,0,0,0.25)]`, `bg-[#000]/50`) swapped for the token's (`border-light-grey-3`, `bg-black/25`,
 * `bg-black/50`), in the prototype's own files only. Everything else exact (in a copied file, inside a shadow or a
 * gradient, an SVG attribute, a value in data) is left as it is, with why.
 */
export function exactFixes(result) {
  const roles = new Map(result.scope.live.map((item) => [item.file, item.role]));
  const fixes = [];
  const left = [];
  for (const finding of result.findings) {
    if (finding.rule !== "colours" || finding.tier !== "exact") continue;
    const done = colourFixesOf(finding, finding.candidates[0]?.name, roles);
    fixes.push(...done.fixes);
    left.push(...done.left);
  }
  return { fixes, left };
}

/** One colour finding's places, each as the swap to `token` it can be, or why it can't be one. */
function colourFixesOf(finding, token, roles) {
  const fixes = [];
  const left = [];
  for (const place of finding.where) {
    const at = { file: place.file, line: place.line, from: place.selector ?? finding.mine.written[0], token };
    if (!OWN.has(roles.get(place.file))) {
      left.push({ ...at, why: "in a file copied from production" });
      continue;
    }
    const cls = (place.selector ?? "").match(/^([\w:-]*-)\[([^\]\s]+)\](\/\d+)?$/);
    const colour = cls ? parseColour(cls[2].replace(/_/g, " ")) : null;
    const same = colour && toHex(colour) === finding.mine.hex && colour.a === finding.mine.alpha;
    // An opacity on the class and in the colour as well: which one is meant isn't for a script to say.
    if (!token || !same || (cls[3] && colour.a < 1)) {
      left.push({ ...at, why: "not written as a colour class" });
      continue;
    }
    fixes.push({ file: place.file, line: place.line, from: place.selector, to: `${cls[1]}${token}${cls[3] ?? ""}`, value: finding.mine.value, token });
  }
  return { fixes, left };
}

/**
 * Makes the fixes in the prototype's files: each class replaced where it was found, and only when it is written once,
 * as a whole class, on that line. Returns those made, and those that weren't, with why.
 */
export function applyFixes(dir, fixes) {
  const made = [];
  const skipped = [];
  const byFile = new Map();
  for (const fix of fixes) byFile.set(fix.file, [...(byFile.get(fix.file) ?? []), fix]);
  for (const [file, list] of byFile) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    for (const fix of list) {
      const whole = new RegExp(`(^|[\\s"'\`{])${escapeRe(fix.from)}(?=$|[\\s"'\`}])`, "g");
      const line = lines[fix.line - 1] ?? "";
      if ((line.match(whole) ?? []).length !== 1) {
        skipped.push({ file, line: fix.line, from: fix.from, token: fix.token, why: "not written once, as a whole class, on its line" });
        continue;
      }
      lines[fix.line - 1] = line.replace(whole, (_, start) => `${start}${fix.to}`);
      made.push(fix);
    }
    if (made.some((fix) => fix.file === file)) writeFileSync(join(dir, file), lines.join("\n"));
  }
  return { made, skipped };
}

/**
 * The scan the skill runs: the exact colours fixed in the prototype's own files first (unless `fix` is false), then
 * scanned again, so the review only has what a person has to decide. Exact colours never reach the review: what was
 * fixed is `fixed`, what was left as it is (and why) is `exact`. With `fix` false it is the plain scan.
 */
export function scanAndFix({ dir, variants, by, fix = true }) {
  const first = scan({ dir, variants, by });
  if (!fix) return first;
  const { fixes, left } = exactFixes(first);
  const { made, skipped } = applyFixes(resolve(dir), fixes);
  const result = made.length ? scan({ dir, variants, by }) : first;
  // Anything exact still there is what couldn't be fixed: listed for engineering, not decided.
  result.findings = result.findings.filter((finding) => !(finding.rule === "colours" && finding.tier === "exact"));
  result.fixed = made.map(({ file, line, from, to, value, token }) => ({ file, line, from, to, value, token }));
  result.exact = [...left, ...skipped];
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Applying the designer's decisions.

/**
 * What can be done to the code by a script, and only that: a colour swapped for its token (approved, or another token
 * picked), and the prototype's edited copy of a design-system component put back as production's. Swapping a hand-built
 * element for a component needs judgement, so it is listed for Claude Code. Adding to the system, ignoring, keeping
 * production's own components and keeping a part with its feature change nothing in the prototype. Every file it is
 * about to change is copied to `.studio/handoff-backup/<time>/` first, so it can be put back.
 */
export function applyDecisions({ dir: dirArg, handoff }) {
  const dir = resolve(dirArg);
  const roles = new Map(handoff.scope.live.map((item) => [item.file, item.role]));
  const colourFixes = [];
  const copies = [];
  const summary = { changed: [], left: [], manual: [], nothing: 0, backup: null };
  for (const finding of handoff.findings) {
    const decision = finding.decision;
    if (!decision) continue;
    if (decision.action === "exception" || decision.action === "add" || decision.action === "extend" || decision.action === "new") {
      summary.nothing++;
      continue;
    }
    if (finding.rule === "colours") {
      const token = decision.action === "pick" ? decision.candidate : finding.proposed.use;
      if (!token) {
        summary.nothing++;
        continue;
      }
      const done = colourFixesOf(finding, token, roles);
      colourFixes.push(...done.fixes);
      summary.left.push(...done.left);
    } else if (finding.kind === "near-match" && finding.mine.edited) {
      copies.push(finding.mine.file);
    } else if (finding.kind === "near-match") {
      // A hand-built element for a component: other props, other markup. Not for a script.
      summary.manual.push({ file: finding.where[0]?.file, line: finding.where[0]?.line ?? 1, name: finding.mine.name, what: finding.proposed.summary });
    } else {
      summary.nothing++;
    }
  }

  const files = [...new Set([...colourFixes.map((fix) => fix.file), ...copies])];
  if (!files.length) return summary;
  const production = copies.length ? loadDesignSystem((paths) => paths.filter((path) => copies.includes(path))).texts : new Map();
  const backup = join(dir, ".studio", "handoff-backup", new Date().toISOString().replace(/[:.]/g, "-"));
  for (const file of files) {
    mkdirSync(dirname(join(backup, file)), { recursive: true });
    copyFileSync(join(dir, file), join(backup, file));
  }
  summary.backup = backup;

  const { made, skipped } = applyFixes(dir, colourFixes);
  // `find` is how to see it in the running page afterwards: a colour swap is on whatever now carries the token's class.
  summary.changed.push(...made.map((fix) => ({ file: fix.file, line: fix.line, what: `${fix.from} → ${fix.to}`, find: { classes: [fix.to] } })));
  summary.left.push(...skipped);
  for (const file of copies) {
    const text = production.get(file);
    if (text === undefined) {
      summary.left.push({ file, line: 1, from: basename(file), why: "production's file couldn't be read" });
      continue;
    }
    writeFileSync(join(dir, file), text);
    // Outlined by the component's name: the running page knows which of its elements are this component, whatever classes production gave it.
    summary.changed.push({ file, line: 1, what: "replaced with production's", find: { classes: [], component: componentName(file) } });
  }
  return summary;
}

/** Puts back every file of a backup made by `applyDecisions`. */
export function restoreBackup({ dir: dirArg, from }) {
  const dir = resolve(dirArg);
  const restored = [];
  for (const entry of readdirSync(from, { recursive: true })) {
    const full = join(from, entry);
    if (!statSync(full).isFile()) continue;
    mkdirSync(dirname(join(dir, entry)), { recursive: true });
    copyFileSync(full, join(dir, entry));
    restored.push(entry);
  }
  return restored;
}

/** The prototype's TypeScript errors in the files that were changed: what the change broke, if it did. */
function typecheck(dir, changed) {
  try {
    const ts = loadTypescript(dir);
    const configPath = join(dir, "tsconfig.json");
    const config = ts.getParsedCommandLineOfConfigFile(configPath, { noEmit: true }, { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} });
    if (!config) return { errors: 0, first: [] };
    const program = ts.createProgram({ rootNames: config.fileNames, options: { ...config.options, noEmit: true } });
    const wanted = new Set(changed.map((file) => resolve(dir, file)));
    const found = ts.getPreEmitDiagnostics(program).filter((item) => item.category === ts.DiagnosticCategory.Error && item.file && wanted.has(resolve(item.file.fileName)));
    return { errors: found.length, first: found.slice(0, 5).map((item) => `${relative(dir, item.file.fileName)}:${item.file.getLineAndCharacterOfPosition(item.start).line + 1} ${ts.flattenDiagnosticMessageText(item.messageText, " ")}`) };
  } catch {
    return { errors: 0, first: [] };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Command line.

/** Where the studio usually runs on a designer's machine; a prototype's own dev server may be on any of them, so each is asked. */
const LOCAL_PORTS = [4747, 3000, 3001, 3002, 3100];

function studioAt(url, headers) {
  return {
    url,
    local: /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url),
    async call(path, init = {}) {
      const response = await fetch(new URL(path, url), { ...init, headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `The studio answered ${response.status}.`);
      return body;
    },
  };
}

/**
 * The studio to use. A handoff is made while the prototype is being worked on, so it goes to the studio running on this
 * machine, which shows the prototype's Live version: found by asking the usual ports which one knows this prototype.
 * `--studio-url` names one; `--remote` uses the studio in ~/.claude/prototype-studio.json (the deployed one, for a version that has been pushed).
 */
async function pickStudio(args, flag) {
  const path = join(homedir(), ".claude", "prototype-studio.json");
  const config = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const password = flag("studio-password") ?? config.password;
  const headers = { "content-type": "application/json", ...(password ? { "x-studio-password": password } : {}) };
  const wanted = (flag("slug") ?? flag("name") ?? "").toLowerCase();
  const explicit = flag("studio-url");
  if (explicit) return studioAt(explicit, headers);
  if (args.includes("--remote")) {
    if (!config.url) throw new Error(`No studio configured in ${path}. Open the studio and use "Get set up".`);
    return studioAt(config.url, headers);
  }
  for (const url of [...new Set([config.localUrl, ...LOCAL_PORTS.map((port) => `http://localhost:${port}`)].filter(Boolean))]) {
    try {
      const response = await fetch(new URL("/api/prototypes", url), { headers, signal: AbortSignal.timeout(2000) });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.prototypes?.some((item) => item.slug === wanted || item.name.toLowerCase() === wanted)) return studioAt(url, headers);
    } catch {
      // Nothing there, or not the studio: the next one.
    }
  }
  throw new Error(`No studio running on this machine knows "${flag("name") ?? flag("slug")}". Start the studio (npm run dev in its folder) and keep the prototype in ~/Claude/prototypes, or pass --studio-url, or --remote for the deployed studio.`);
}

/** The prototype in the studio, by --slug or --name, and the version: --version, else its newest. */
async function whichVersion(studio, flag) {
  const wanted = flag("slug") ?? flag("name");
  if (!wanted) throw new Error("Say which prototype in the studio this is: --name \"<its name>\" (or --slug).");
  const { prototypes } = await studio.call("/api/prototypes");
  const found = prototypes.find((item) => item.slug === wanted || item.name.toLowerCase() === wanted.toLowerCase());
  if (!found) throw new Error(`The studio has no prototype called "${wanted}". /push it first, then hand it off.`);
  return { slug: found.slug, version: flag("version") ?? found.latest };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
  const all = (name) => args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
  const dry = args.includes("--dry");

  if (args.includes("--apply") || args.includes("--restore")) {
    const dir = resolve(flag("dir") ?? ".");
    const handoff = JSON.parse(readFileSync(flag("handoff"), "utf8"));
    const summary = args.includes("--apply") ? applyDecisions({ dir, handoff }) : { changed: [], left: [], manual: [], nothing: 0, backup: null, restored: restoreBackup({ dir, from: resolve(flag("restore")) }) };
    summary.check = typecheck(dir, [...summary.changed.map((item) => item.file), ...(summary.restored ?? [])]);
    if (flag("summary")) writeFileSync(resolve(flag("summary")), `${JSON.stringify(summary, null, 2)}\n`);
    // The findings again, so what was applied is gone from them. Decisions made on the rest are kept when it is saved.
    if (flag("rescan")) {
      const variants = handoff.scope.variants.map(({ id, entries }) => ({ id, entries }));
      writeFileSync(resolve(flag("rescan")), `${JSON.stringify(scan({ dir, variants, by: flag("by") ?? "Someone" }), null, 2)}\n`);
    }
    console.log(`Changed ${summary.changed.length}, for Claude Code ${summary.manual.length}, nothing to change ${summary.nothing}${summary.backup ? `. Backup: ${summary.backup}` : ""}${summary.restored ? `. Restored ${summary.restored.length} files` : ""}.`);
    return;
  }

  if (args.includes("--fetch")) {
    const studio = await pickStudio(args, flag);
    const { slug, version } = await whichVersion(studio, flag);
    const { handoff } = await studio.call(`/api/handoff?slug=${encodeURIComponent(slug)}&version=${encodeURIComponent(version)}`);
    const out = resolve(flag("out") ?? join(tmpdir(), `handoff-${slug}-${version}.json`));
    writeFileSync(out, `${JSON.stringify(handoff, null, 2)}\n`);
    console.log(`Decisions: ${out}`);
    console.log(handoff.signOff ? `Signed off by ${handoff.signOff.by} on ${handoff.signOff.at.slice(0, 10)}.` : "Not signed off yet: the designer is still deciding.");
    return;
  }

  const dir = flag("dir");
  if (!dir) throw new Error('Usage: node scan.mjs --dir <prototype> --variant <option>=<entry>,<entry> [--variant ...] --name "<name in the studio>" [--version v0.4] [--out file] [--dry]');
  const variants = all("variant").map((spec) => {
    const [id, files] = spec.split("=");
    return { id: id.trim(), entries: (files ?? "").split(",").map((file) => file.trim()).filter(Boolean) };
  });
  // Which version it describes is settled first, so a scan is never done for nothing.
  const studio = dry ? null : await pickStudio(args, flag);
  const target = studio ? await whichVersion(studio, flag) : null;
  const by = flag("by") ?? spawnSync("git", ["config", "user.name"], { encoding: "utf8" }).stdout?.trim();
  const result = scanAndFix({ dir, variants, by: by || "Someone", fix: !args.includes("--no-fix") });
  result.prototype = target;

  const out = resolve(flag("out") ?? join(tmpdir(), `handoff-${target?.slug ?? basename(resolve(dir))}-${target?.version ?? "scan"}.json`));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  printSummary(result);
  if (result.fixed) {
    console.log(`\nFixed in the prototype's code (${result.fixed.length}):`);
    for (const item of result.fixed) console.log(`  ${item.file}:${item.line}  ${item.from} -> ${item.to}`);
    console.log(`Exact, left as written (${result.exact.length}):`);
    for (const item of result.exact) console.log(`  ${item.file}:${item.line}  ${item.from} (${item.token}): ${item.why}`);
  }
  console.log(`\nFindings: ${out}`);
  if (!studio) return;

  const saved = await studio.call("/api/handoff", { method: "POST", body: JSON.stringify({ ...target, handoff: result }) });
  console.log(`Saved to the studio on ${studio.local ? "this machine" : studio.url} for ${target.slug} ${saved.version}${saved.kept ? ` (${saved.kept} earlier decisions kept)` : ""}. Review it here: ${saved.review}`);
}

export function printSummary(result) {
  const { scope, findings, lift, designSystem } = result;
  const count = (role) => scope.live.filter((item) => item.role === role).length;
  console.log(`Design system: ${designSystem.repo}@${designSystem.sha.slice(0, 7)} (${designSystem.source}${designSystem.note ? `; ${designSystem.note}` : ""})`);
  console.log(`Final variants: ${scope.variants.map((item) => `${item.label} (${item.id})`).join(", ")}`);
  console.log(`Live files: ${scope.live.length}: ${count("new")} new components, ${count("supporting")} supporting, ${count("stand-in")} stand-ins, ${count("kit")} from the kits, ${count("design-system")} design system, ${count("repo-copy")} unchanged repo files, ${count("plumbing")} studio plumbing`);
  console.log(`Not handed off (${scope.dropped.length}): ${scope.dropped.map((file) => basename(file)).join(", ")}`);
  const kinds = {};
  for (const finding of findings) (kinds[finding.kind] ??= []).push(finding);
  for (const [kind, list] of Object.entries(kinds)) {
    console.log(`\n${kind} (${list.length})`);
    for (const finding of list) {
      const candidate = finding.candidates[0];
      const label = finding.rule === "colours" ? finding.mine.value : `${finding.mine.name}${finding.mine.element ? ` ${finding.mine.element}:${finding.mine.line}` : ""}`;
      const extra = finding.kind === "new-reusable" || finding.kind === "feature-only" ? ` (rendered ${finding.mine.useCount}x${finding.mine.duplicates.length ? `, like ${finding.mine.duplicates.map((item) => basename(item.file)).join(", ")}` : ""})` : "";
      console.log(`  [${finding.tier}] ${label}${candidate ? ` -> ${candidate.name} (${candidate.score})` : ""}${extra}  ${finding.where.length > 1 ? `${finding.where.length} places` : `${finding.where[0].file}:${finding.where[0].line}`}`);
    }
  }
  console.log(`\nTODO(lift): ${lift.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
