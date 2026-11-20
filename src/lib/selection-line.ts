import { childrenIn, type PageTree } from "@/lib/page-tree";

/** Tags that say what a wrapper is, so it is worth naming as the place something is in. */
const MEANINGFUL = /^(section|header|footer|main|nav|form|article|aside|ul|ol|table|dialog|button|a)\b/;

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * What to tell Claude about the element picked in a prototype, as little as will do. Claude finds things by searching
 * the code, so what it needs is the words and the class names: the element as the layers panel names it (`ul .mt-6`,
 * `li “High protein”`), where it is (the nearest wrappers worth naming), and, for a group, what is in it. The tree is
 * the page's own (see `page-tree.ts`); without one the tag is all there is to say.
 */
export function selectionLine(tree: PageTree | null, selector: string, tag: string, component?: string) {
  const at = tree ? tree.selector.indexOf(selector) : -1;
  if (!tree || at < 0) return { line: component ? `${tag} (the ${component} component)` : tag, chip: tag };

  const name = tree.name[at];
  // The nearest two wrappers with something to call them, outermost first.
  const wrappers: string[] = [];
  for (let up = tree.parent[at]; up >= 0 && wrappers.length < 2; up = tree.parent[up]) {
    if (/[.“]/.test(tree.name[up]) || MEANINGFUL.test(tree.name[up])) wrappers.unshift(tree.name[up]);
  }
  const kids = childrenIn(tree, at);
  const items = kids.slice(0, 5).map((kid) => short(tree.name[kid], 40));
  const parts = [
    name,
    wrappers.length ? `in ${wrappers.join(" > ")}` : "",
    items.length ? `containing ${items.join(", ")}${kids.length > items.length ? `, and ${kids.length - items.length} more` : ""}` : "",
    component ? `the ${component} component` : "",
  ].filter(Boolean);
  return { line: short(parts.join(", "), 400), chip: short(name, 32) };
}
