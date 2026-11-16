import type { Mark } from "@/lib/handoff";
import { isFind } from "@/lib/handoff-clip";
import type { PublicHandoff } from "@/lib/handoff-public";

/** A component the scan thinks is new, offered in the frame for the designer to add; the same as a mark, before it is one. */
export type Suggestion = Pick<Mark, "id" | "name" | "file" | "line" | "endLine" | "find" | "screen">;

/**
 * What the scan found in the prototype's own code that production doesn't have, as components to add to the frame:
 * the new ones, new and reusable or for one feature, unless they were ignored. A prototype that is itself one
 * component has none of those, so its page is offered, the thing it is. Only what can be seen on a design is offered,
 * and not what is already marked.
 */
export function suggestionsOf(data: PublicHandoff): Suggestion[] {
  const marked = new Set(data.marks.map((mark) => mark.id));
  /** A file's outermost element: the one that is the component as drawn. */
  const outermost = (file: string) => data.elements.filter((item) => item.file === file && item.endLine < 9999).sort((a, b) => a.line - b.line || b.endLine - a.endLine)[0];
  const found = new Map<string, Suggestion>();
  const offer = (name: string, file: string, screen: string | undefined, find: unknown) => {
    const row = outermost(file);
    const id = `${file}:${row?.line}`;
    if (!row || marked.has(id) || found.has(id) || !screen) return;
    found.set(id, { id, name, file, line: row.line, endLine: row.endLine, find: isFind(find) ? find : row.find, screen });
  };

  for (const finding of data.findings) {
    if (finding.rule !== "components" || (finding.kind !== "new-reusable" && finding.kind !== "feature-only") || finding.decision?.action === "exception") continue;
    const where = finding.where[0];
    const name = typeof finding.mine.name === "string" ? finding.mine.name : undefined;
    if (where && name) offer(name, where.file, where.variants?.[0] ?? data.variants[0], finding.mine.find);
  }
  if (!found.size && !data.marks.length) for (const page of data.pages) offer(page.name, page.file, page.variants[0] ?? data.variants[0], undefined);
  return [...found.values()];
}
