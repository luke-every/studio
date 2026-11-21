import { selectorFor } from "@/lib/edit-dom";
import { componentOf } from "@/lib/edit-part";

/**
 * A page's elements as a flat tree, for the layers panel: by position, each element's parent (-1 at the top), a name,
 * and the selector that finds it again (the one a part picked on the page carries, so the two can be matched).
 */
export type PageTree = {
  parent: number[];
  name: string[];
  selector: string[];
  /** Where an element is the root of a component (the design system's, or one put on the canvas), the component's name; null elsewhere. */
  component?: (string | null)[];
  /** On a fork's page: the element that holds the fork (`data-stage`), so its layers can start at the fork's own top element, with nothing above it hidden. */
  stage?: number;
};

const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "NOSCRIPT", "TITLE", "HEAD"]);
/** The framework's own elements (Next's route announcer and its error portal) are not part of the page, so they are not layers. */
const FRAMEWORK = /^(next-route-announcer|nextjs-portal)$/i;
const MAX = 1500;

/** What to call an element: its tag with its id or first class, and its words when it is just words. */
export function nameOfElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  const label = element.id ? element.id : (element.getAttribute("class") ?? "").split(/\s+/).find(Boolean);
  const words = !element.children.length ? (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 32) : "";
  return words ? `${tag} “${words}”` : label ? `${tag} .${label}` : tag;
}

/** The elements inside `root` that are on the page (not scripts, not hidden), as a tree; `name` and `keep` let a caller say more about them. */
export function treeOfRoot(root: Element, name: (element: Element) => string = nameOfElement, keep: (element: Element) => boolean = () => true, componentName?: (element: Element) => string | null): PageTree {
  const tree: PageTree = { parent: [], name: [], selector: [], ...(componentName ? { component: [] } : {}) };
  const walk = (element: Element, parent: number) => {
    for (const child of element.children) {
      if (tree.parent.length >= MAX) return;
      if (SKIP.has(child.tagName) || FRAMEWORK.test(child.tagName) || child.hasAttribute("data-studio-skip") || !keep(child)) continue;
      const at = tree.parent.length;
      tree.parent.push(parent);
      const component = componentName?.(child) ?? null;
      tree.name.push(component ?? name(child));
      tree.component?.push(component);
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

/** A document's tree, from its body. With the design system's component names, an element that is the root of one of them is named for it. */
export const treeOf = (doc: Document, components?: string[] | null): PageTree => {
  if (!doc.body) return { parent: [], name: [], selector: [] };
  const known = new Set(components ?? []);
  const named = (element: Element) => { const found = componentOf(element, known); return found && found.root === element ? found.name : null; };
  const tree = treeOfRoot(doc.body, nameOfElement, (element) => !hidden(element), named);
  const holder = doc.querySelector("[data-stage]");
  const at = holder ? tree.selector.indexOf(selectorFor(holder)) : -1;
  if (at >= 0) tree.stage = at;
  return tree;
};

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
