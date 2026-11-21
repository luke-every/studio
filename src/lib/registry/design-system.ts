import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { workingFolder } from "./local-prototypes";

/**
 * The design system of a live version, read from its folder: its components are the files in `src/components/shared/`
 * (and `modals/` in it) the icons in `src/components/icons/` and the site's pieces in `src/components/website/` (the kit's header, footer and the like), and a component's props are its `Props` type, read
 * with the TypeScript compiler without running anything.
 */
export type PropSpec = { name: string; optional: boolean; kind: "options" | "boolean" | "string" | "number" | "other"; options?: string[] };

const DIRS = [join("src", "components", "shared"), join("src", "components", "shared", "modals"), join("src", "components", "icons"), join("src", "components", "website")];

/** The folders searched all the way down: a site section is a component however deep in them it is kept. */
const DEEP = [join("src", "components", "shared"), join("src", "components", "website")];

async function walk(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (/\.tsx$/.test(entry.name) && !/\.(stories|test|spec)\.tsx$/.test(entry.name)) out.push(path);
  }
  return out;
}

async function files(folder: string) {
  const found = new Map<string, string>();
  for (const dir of DIRS) {
    for (const file of await readdir(join(folder, dir)).catch(() => [] as string[])) {
      const match = file.match(/^(\w+)\.tsx$/);
      if (match && !found.has(match[1])) found.set(match[1], join(folder, dir, file));
    }
  }
  for (const dir of DEEP) {
    for (const path of await walk(join(folder, dir))) {
      const file = path.match(/(\w+)\.tsx$/)?.[1];
      if (file && !found.has(file)) found.set(file, path);
      // What a file exports counts under its own name too (a file can hold a component of another name).
      const text = await readFile(path, "utf8").catch(() => "");
      for (const [, name] of text.matchAll(/^export (?:default )?(?:function|const) ([A-Z]\w*)/gm)) if (!found.has(name)) found.set(name, path);
    }
  }
  return found;
}

async function propsOf(path: string, name: string): Promise<PropSpec[]> {
  const ts = await import("typescript");
  const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = new Map<string, import("typescript").TypeNode>();
  const members: import("typescript").TypeElement[] = [];
  const collect = (node: import("typescript").TypeNode) => {
    if (ts.isTypeLiteralNode(node)) members.push(...node.members);
    else if (ts.isIntersectionTypeNode(node)) node.types.forEach(collect);
    else if (ts.isParenthesizedTypeNode(node)) collect(node.type);
  };
  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
  }
  for (const statement of source.statements) {
    if (ts.isTypeAliasDeclaration(statement) && (statement.name.text === "Props" || statement.name.text === `${name}Props`)) collect(statement.type);
    else if (ts.isInterfaceDeclaration(statement) && (statement.name.text === "Props" || statement.name.text === `${name}Props`)) members.push(...statement.members);
  }

  const kindOf = (node: import("typescript").TypeNode): Pick<PropSpec, "kind" | "options"> => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && aliases.has(node.typeName.text)) return kindOf(aliases.get(node.typeName.text)!);
    if (node.kind === ts.SyntaxKind.BooleanKeyword) return { kind: "boolean" };
    if (node.kind === ts.SyntaxKind.StringKeyword) return { kind: "string" };
    if (node.kind === ts.SyntaxKind.NumberKeyword) return { kind: "number" };
    if (ts.isUnionTypeNode(node)) {
      // `undefined` and `null` only say it is optional.
      const rest = node.types.filter((type) => type.kind !== ts.SyntaxKind.UndefinedKeyword && !(ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword));
      const options = rest.flatMap((type) => (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? [type.literal.text] : []));
      if (rest.length && options.length === rest.length) return { kind: "options", options };
      return rest.length === 1 ? kindOf(rest[0]) : { kind: "other" };
    }
    if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) return { kind: "options", options: [node.literal.text] };
    return { kind: "other" };
  };

  return members.flatMap((member) =>
    ts.isPropertySignature(member) && member.type && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
      ? [{ name: member.name.text, optional: !!member.questionToken, ...kindOf(member.type) }]
      : [],
  );
}

/**
 * The colour tokens of a version's design system: the `--color-*` in the `@theme` of its `globals.css`, in the live
 * version's folder or else the production repository's clone. The page can't say them itself: `@theme inline` puts a
 * token's colour straight into the classes that use it and defines no variable to read. `var()`s are followed through `:root`.
 */
export async function designTokens(slug: string) {
  const folders: string[] = [];
  try {
    folders.push(workingFolder(slug));
  } catch {
    // Not on this machine: the production design system stands in.
  }
  folders.push(join(homedir(), "Claude", "every-website-main"), join(homedir(), "Claude", "every-website"));
  for (const folder of folders) {
    for (const app of [join("src", "app"), "app"]) {
      const css = await readFile(join(folder, app, "globals.css"), "utf8").catch(() => null);
      if (css === null) continue;
      const roots = new Map([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
      const colours: { name: string; value: string }[] = [];
      for (const block of css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)) {
        for (const [, name, raw] of block[1].matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)) {
          let value = raw.trim();
          for (let i = 0; i < 4 && value.startsWith("var("); i++) value = roots.get(value.match(/var\((--[\w-]+)/)?.[1] ?? "") ?? value;
          if (!value.startsWith("var(") && !colours.some((item) => item.name === name)) colours.push({ name, value });
        }
      }
      if (colours.length) return colours;
    }
  }
  return [];
}

/** The names of a live version's design-system components and, when one is asked for, its props. */
export async function designSystem(slug: string, name?: string) {
  // A prototype's components are its own folder's and the website's, which it imports through the path overlay and so does not have a copy of: both are known by name.
  const found = new Map([...(await files(join(homedir(), "Claude", "every-website-main"))), ...(await files(workingFolder(slug)))]);
  const path = name ? found.get(name) : undefined;
  return { names: [...found.keys()], props: path && name ? await propsOf(path, name) : [] };
}
