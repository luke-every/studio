import type { Box, Reach } from "@/lib/anchor";
import type { Snapshot } from "@/lib/dom-snapshot";
import { describePart } from "@/lib/edit-part";

import type { FramePage } from "./frame-page";

/**
 * A static copy of a page (see lib/dom-snapshot.ts), answering the canvas's questions the way a live page does (see
 * `FramePage`), with no page to ask.
 *
 * What is under a point is worked out from the geometry recorded when the copy was read: every element's box in the
 * page's own pixels, and how they nest. Nothing is measured on the copy itself, so it makes no difference how far it is
 * scaled or where it sits on the canvas, and nothing here has to get past `pointer-events` or lift anything inert. The rules
 * are the page-side ones in `lib/anchor.ts` (`elementAt`, `topGroup`, `groupsIn`) and `lib/edit-part.ts` (`reachFrom`,
 * `hoverBox`), written over the recorded boxes; an element is the one whose copy carries `data-ix` with its number.
 *
 * Hovering and picking a part (for the edit panel) are answered. Placing a comment and the rest say they can't (null), which is
 * what a page with nothing at the point says: those still need the live page. A part is described from the copy's own elements,
 * with its pixels turned back into the page's (see `describePart`) and its tokens as read when it was copied.
 */
const MAX_GROUPS = 24;

/**
 * A copy's shadow root as the document the edit painter and the typing-over code look things up in. They only ever look an
 * element up by selector (`querySelector`) and put a style in the head, so that is all it answers, and everything it reaches is
 * inside the copy: nothing painted through it can land on the studio. A path from `body` starts at the copy's root instead.
 */
export function copyDocument(shadow: ShadowRoot): Document {
  return {
    querySelector: (selector: string) => shadow.querySelector(selector.replace(/^body\b/, "[data-studio-root]")),
    body: shadow.host,
    head: shadow,
    createElement: (tag: string) => document.createElement(tag),
  } as unknown as Document;
}

export function copyPage(snapshot: Snapshot, shadow: ShadowRoot): FramePage {
  const g = snapshot.geometry;
  const box = (ix: number): Box => ({ left: g.boxes[ix * 4], top: g.boxes[ix * 4 + 1], width: g.boxes[ix * 4 + 2], height: g.boxes[ix * 4 + 3] });

  const children: number[][] = Array.from({ length: g.count }, () => []);
  for (let ix = 1; ix < g.count; ix++) if (g.parent[ix] >= 0) children[g.parent[ix]].push(ix);

  /** Whether `ancestor` is `ix` or holds it. */
  const holds = (ancestor: number, ix: number) => {
    for (let at = ix; at >= 0; at = g.parent[at]) if (at === ancestor) return true;
    return false;
  };

  /** The element at the very top of the stack at a point: the last in the document that holds it, as later elements are drawn over earlier ones. -1 when there is none. */
  const hit = (x: number, y: number) => {
    for (let ix = g.count - 1; ix >= 1; ix--) {
      if (!g.hittable[ix]) continue;
      const left = g.boxes[ix * 4];
      const top = g.boxes[ix * 4 + 1];
      if (x >= left && x < left + g.boxes[ix * 4 + 2] && y >= top && y < top + g.boxes[ix * 4 + 3]) return ix;
    }
    return -1;
  };

  /** The child of the page's root that holds an element: the section of the page it is part of. */
  const topGroup = (ix: number) => {
    if (ix === g.root || holds(ix, g.root)) return ix;
    let top = ix;
    while (g.parent[top] > 0 && g.parent[top] !== g.root) top = g.parent[top];
    return top;
  };

  /** The element a comment or a pick at a point would land on; -1 on the bare page. Not `deep`: the top-level group. */
  const elementAt = (x: number, y: number, deep = true) => {
    const found = hit(x, y);
    if (found < 0) return -1;
    // The page itself (its root, and the wrappers around it) is never an element to pick: it is the frame.
    if (children[g.root].length && holds(found, g.root)) return -1;
    return deep ? found : topGroup(found);
  };

  const indexOfSelector = (selector: string) => {
    try {
      const element = shadow.querySelector(selector.replace(/^body\b/, "[data-studio-root]"));
      return element ? Number(element.getAttribute("data-ix")) : -1;
    } catch {
      return -1;
    }
  };

  /** What a tap or hover beside or inside an element that is already selected lands on (see `reachFrom`); -1 when it isn't that. */
  const reachFrom = (found: number, from: { selector: string; into?: boolean } | undefined) => {
    const selected = from && found >= 0 ? indexOfSelector(from.selector) : -1;
    if (!from || found < 0 || selected < 0) return -1;
    if (holds(selected, found)) {
      if (!from.into) return selected;
      // On the element itself (its own words, or a gap), there is nothing deeper there.
      if (found === selected) return -1;
      let child = found;
      while (g.parent[child] >= 0 && g.parent[child] !== selected) child = g.parent[child];
      return child === selected ? -1 : child;
    }
    if (from.into) return -1;
    for (let group = g.parent[selected]; group > 0; group = g.parent[group]) {
      if (!holds(group, found)) continue;
      // In the gap between its children, the point is on the group itself: that is what is beside the selection.
      if (found === group) return group === g.root || holds(group, g.root) ? -1 : group;
      let beside = found;
      while (g.parent[beside] >= 0 && g.parent[beside] !== group) beside = g.parent[beside];
      // At the page's own wrapper it is the top-level group, which a click picks anyway.
      return beside === g.root || holds(beside, g.root) ? -1 : beside;
    }
    return -1;
  };

  /** The groups directly inside an element: a child that is the whole of its parent is looked through to what it holds. */
  const groupsIn = (ix: number, depth = 0): number[] => {
    const own = box(ix);
    const found: number[] = [];
    for (const child of children[ix]) {
      if (!g.drawn[child]) continue;
      const rect = box(child);
      if (rect.width < own.width * 0.98 || rect.height < own.height * 0.98) found.push(child);
      else if (depth < 3) found.push(...groupsIn(child, depth + 1));
    }
    return found;
  };

  /** An element's box, and with `groups` the boxes of what is directly inside it, each drawn only as far as its parent shows it. */
  const boxOf = (ix: number, groups = false): Box => {
    // Drawn as a component's when it is, or is inside, a design-system component (as `hoverBox` does on a live page).
    const component = g.inComponent[ix] >= 0 ? { component: true } : {};
    const { left, top, width, height } = box(ix);
    if (!groups) return { left, top, width, height, ...component };
    const inside = groupsIn(ix)
      .slice(0, MAX_GROUPS)
      .map((child) => {
        const rect = box(child);
        const l = Math.max(rect.left, left);
        const t = Math.max(rect.top, top);
        return { left: l, top: t, width: Math.min(rect.left + rect.width, left + width) - l, height: Math.min(rect.top + rect.height, top + height) - t };
      })
      .filter((one) => one.width >= 8 && one.height >= 8);
    return { left, top, width, height, children: inside, ...component };
  };

  return {
    scope: copyDocument(shadow),
    // The box a click at (x, y) would outline: what it would pick, with its groups when asked (see `hoverBox`).
    boxAt: async (x, y, reach: Reach = {}) => {
      const found = elementAt(x, y);
      const beside = reachFrom(found, reach.from ? { selector: reach.from.selector, into: !!reach.from.into } : undefined);
      const element = beside >= 0 ? beside : reach.deep !== false ? found : elementAt(x, y, false);
      return element >= 0 ? boxOf(element, reach.groups) : null;
    },
    anchorAt: async () => null,
    // The part a tap at (x, y) picks: what boxAt outlines there, described for the panel. `deep` reaches the bottom; otherwise the page's section.
    partAt: async (x, y, deep = true, from) => {
      const found = elementAt(x, y);
      const beside = reachFrom(found, from ? { selector: from.selector, into: !!from.into } : undefined);
      const ix = beside >= 0 ? beside : from?.into ? -1 : deep ? found : elementAt(x, y, false);
      const element = ix >= 0 ? shadow.querySelector(`[data-ix="${ix}"]`) : null;
      if (!element) return null;
      const part = describePart(element, undefined, snapshot.tokens);
      // As on a live page: a component's root is the component (with its props), and what is inside one is marked as inside it.
      const one = g.components[g.inComponent[ix]];
      if (one) return one.root === ix ? { ...part, component: { name: one.name, props: one.props, preview: false } } : { ...part, inside: one.name };
      return part;
    },
    fonts: async () => [],
    anchorOf: async () => null,
    scrollAt: () => {},
    spots: () => ({}),
    reveal: (_anchor, done) => {
      done(false);
      return () => {};
    },
  };
}
