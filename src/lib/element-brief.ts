import ts from "typescript";

/**
 * What an engineer's agent gets for one element: its code and nothing else, with where the rest is. `loc` is `file:line:col` as `data-studio-loc` writes it (the
 * position of the tag's name). The snippet is the whole element (children too), cut at `MAX_LINES`; the imports are only the ones it uses.
 */
const MAX_LINES = 80;

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
};

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

export function elementBrief(source: string, context: ElementContext): string | null {
  const sf = ts.createSourceFile(context.file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hit: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
  const visit = (node: ts.Node) => {
    if (hit.length) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening) {
      const at = sf.getLineAndCharacterOfPosition(opening.tagName.getStart(sf));
      if (at.line + 1 === context.line && at.character + 1 === context.column) {
        hit.push(node as ts.JsxElement | ts.JsxSelfClosingElement);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const element = hit[0];
  if (!element) return null;

  const start = sf.getLineAndCharacterOfPosition(element.getStart(sf)).line;
  const end = sf.getLineAndCharacterOfPosition(element.getEnd()).line;
  const lines = source.split("\n").slice(start, end + 1);
  const cut = lines.length > MAX_LINES;

  // Names the snippet uses, and the import each comes from.
  const used = new Set<string>();
  const tags = new Set<string>();
  const collect = (node: ts.Node) => {
    if (ts.isIdentifier(node)) used.add(node.text);
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /^[A-Z]/.test(node.tagName.getText(sf))) tags.add(node.tagName.getText(sf).split(".")[0]);
    ts.forEachChild(node, collect);
  };
  collect(element);
  const imports: string[] = [];
  const nested: string[] = [];
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    const names = [clause?.name?.text, ...(clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements.map((one) => one.name.text) : []), clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) ? clause.namedBindings.name.text : undefined].filter((one): one is string => !!one);
    if (!names.some((one) => used.has(one))) continue;
    imports.push(statement.getText(sf));
    const target = resolveImport(context.file, statement.moduleSpecifier.text);
    const origin = target ? context.origin?.(target) : null;
    for (const name of names) if (tags.has(name)) nested.push(`- \`${name}\` — \`${statement.moduleSpecifier.text}\`${origin ? `: ${origin}` : ""}`);
  }

  const here = context.origin?.(context.file.replace(/\.tsx?$/, ""));
  return [
    `# ${context.file}:${start + 1}-${end + 1}`,
    ...(here ? ["", `This file is ${here}`] : []),
    "",
    "```tsx",
    ...imports,
    ...(imports.length ? [""] : []),
    ...lines.slice(0, MAX_LINES),
    ...(cut ? ["// … cut short: the file has the rest"] : []),
    "```",
    "",
    "## More",
    ...context.fileLinks.map((link) => `- Whole file: ${link}`),
    ...(context.production ? [`- Production counterpart: \`${context.production}\``] : []),
    ...(nested.length ? ["- Components used (open their files if you need them):", ...nested.map((one) => `  ${one}`)] : []),
    "",
  ].join("\n");
}
