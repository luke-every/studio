import { selectorFor } from "@/lib/edit-dom";

/**
 * A page's elements as a flat tree, for the layers panel: by position, each element's parent (-1 at the top), a name,
 * and the selector that finds it again (the one a part picked on the page carries, so the two can be matched).
 */
export type PageTree = { parent: number[]; name: string[]; selector: string[] };

const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "NOSCRIPT", "TITLE", "HEAD"]);
const MAX = 1500;

/** What to call an element: its tag with its id or first class, and its words when it is just words. */
export function nameOfElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  const label = element.id ? element.id : (element.getAttribute("class") ?? "").split(/\s+/).find(Boolean);
  const words = !element.children.length ? (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32) : "";
  return words ? `${tag} “${words}”` : label ? `${tag} .${label}` : tag;
}

/** The elements inside `root` that are on the page (not scripts, not hidden), as a tree; `name` and `keep` let a caller say more about them. */
export function treeOfRoot(root: Element, name: (element: Element) => string = nameOfElement, keep: (element: Element) => boolean = () => true): PageTree {
  const tree: PageTree = { parent: [], name: [], selector: [] };
  const walk = (element: Element, parent: number) => {
    for (const child of element.children) {
      if (tree.parent.length >= MAX) return;
      if (SKIP.has(child.tagName) || child.hasAttribute("data-studio-skip") || !keep(child)) continue;
      const at = tree.parent.length;
      tree.parent.push(parent);
      tree.name.push(name(child));
      tree.selector.push(selectorFor(child));
      walk(child, at);
    }
  };
  walk(root, -1);
  return tree;
}

const hidden = (element: Element) => {
  const style = getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden";
};

/** A document's tree, from its body. */
export const treeOf = (doc: Document): PageTree => (doc.body ? treeOfRoot(doc.body, nameOfElement, (element) => !hidden(element)) : { parent: [], name: [], selector: [] });

const kidsOf = new WeakMap<PageTree, number[][]>();
/** Each element's children, by position, with -1's own (the top level) last. */
export function childrenIn(tree: PageTree, at: number): number[] {
  let all = kidsOf.get(tree);
  if (!all) {
    all = Array.from({ length: tree.parent.length + 1 }, () => []);
    tree.parent.forEach((parent, ix) => all![parent < 0 ? tree.parent.length : parent].push(ix));
    kidsOf.set(tree, all);
  }
  return all[at < 0 ? tree.parent.length : at];
}
