import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { workingFolder } from "./local-prototypes";

/**
 * The design system of a live version, read from its folder: its components are the files in `src/components/shared/`
 * (and `modals/` in it) and the icons in `src/components/icons/`, and a component's props are its `Props` type, read
 * with the TypeScript compiler without running anything.
 */
export type PropSpec = { name: string; optional: boolean; kind: "options" | "boolean" | "string" | "number" | "other"; options?: string[] };

const DIRS = [join("src", "components", "shared"), join("src", "components", "shared", "modals"), join("src", "components", "icons")];

async function files(folder: string) {
  const found = new Map<string, string>();
  for (const dir of DIRS) {
    for (const file of await readdir(join(folder, dir)).catch(() => [] as string[])) {
      const match = file.match(/^(\w+)\.tsx$/);
      if (match && !found.has(match[1])) found.set(match[1], join(folder, dir, file));
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

/** The names of a live version's design-system components and, when one is asked for, its props. */
export async function designSystem(slug: string, name?: string) {
  const found = await files(workingFolder(slug));
  const path = name ? found.get(name) : undefined;
  return { names: [...found.keys()], props: path && name ? await propsOf(path, name) : [] };
}
