import type { Anchor } from "@/lib/comments";
import { selectorFor } from "@/lib/edit-dom";

/**
 * Where a comment is left in a prototype, and finding that place again.
 *
 * Plain DOM, no React: the studio uses it, and it is built into
 * `public/studio-anchor.js` for the phone's comment script (see
 * `scripts/build-anchor.ts`), so a comment left anywhere describes its place
 * the same way.
 */

export type Spot = { x: number; y: number };
/** A spot, and whether it is the comment's place as it was left, or only the nearest thing there (`nearestOf`). */
export type Found = Spot & { exact: boolean };
/** Whether a key in the prototype's address is the studio's (a control, a variant, the review token) rather than the prototype's own. */
export type StudioOwns = (key: string) => boolean;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const snippet = (element: Element) =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * What a page is saying, in a few words: the start of its visible text, with
 * numbers and punctuation left out so a counter or a clock doesn't change it.
 * Steps of a flow share one address and often one layout, so this is what
 * tells them apart.
 */
export function pageKey(doc: Document) {
  return (doc.body?.innerText ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * What kind of element this is: its tag and classes, and those of the few
 * elements above it, with no counting. A meal card's rating is still a meal
 * card's rating when the page holds other meals in another order, as a
 * prototype built from somebody's own answers will. Undefined when nothing
 * near it has a class to go by.
 */
export function shapeFor(element: Element): string | undefined {
  const parts: string[] = [];
  for (let node: Element | null = element; node && node.tagName !== "BODY" && parts.length < 4; node = node.parentElement) {
    parts.unshift([node.tagName.toLowerCase(), ...[...node.classList].map((name) => `.${CSS.escape(name)}`)].join(""));
  }
  // Kept within what a comment can hold, from the element up.
  while (parts.join(" > ").length > 1000) parts.shift();
  return parts.some((part) => part.includes(".")) ? parts.join(" > ") : undefined;
}

/**
 * The prototype's own place in its address: the query it set itself (not the
 * studio's) and its hash, as `?step=2#done`. Empty when it has none.
 */
export function stateOf(location: Pick<Location, "search" | "hash">, studioOwns: StudioOwns) {
  const own = new URLSearchParams();
  new URLSearchParams(location.search).forEach((value, key) => {
    if (!studioOwns(key)) own.append(key, value);
  });
  const query = own.toString();
  return `${query ? `?${query}` : ""}${location.hash}`;
}

/**
 * Where to send a frame so it shows an anchor's screen: the anchor's path, and
 * its own state when it noted one (comments left before that didn't), keeping
 * what the studio put in the address. Null when the frame is there already;
 * `reload` is false when only the hash changes, which loads nothing.
 */
export function addressFor(location: Location, anchor: Anchor, studioOwns: StudioOwns) {
  const url = new URL(location.href);
  url.pathname = anchor.screen;
  if (anchor.state !== undefined) {
    const hashAt = anchor.state.indexOf("#");
    const own = new URLSearchParams(hashAt < 0 ? anchor.state : anchor.state.slice(0, hashAt));
    // What the prototype had set itself goes; what the comment noted takes its place, over the studio's if they share a key.
    for (const key of new Set(url.searchParams.keys())) if (!studioOwns(key) || own.has(key)) url.searchParams.delete(key);
    own.forEach((value, key) => url.searchParams.append(key, value));
    url.hash = hashAt < 0 ? "" : anchor.state.slice(hashAt);
  }
  // Compared with the keys in order, so the same address written another way isn't a reason to load it again.
  const query = (search: string) => {
    const params = new URLSearchParams(search);
    params.sort();
    return params.toString();
  };
  const reload = url.pathname !== location.pathname || query(url.search) !== query(location.search);
  if (!reload && url.hash === location.hash) return null;
  return { href: url.href, reload };
}

/** For a frame whose address the studio set: every key in that address is the studio's, whatever the prototype adds after. */
export function ownedBy(frame: HTMLIFrameElement): StudioOwns {
  const keys = new URL(frame.src, window.location.href).searchParams;
  return (key) => keys.has(key);
}

/** The anchor for a click at (x, y) in a document's own pixels. */
export function anchorAt(doc: Document, x: number, y: number, studioOwns: StudioOwns): Anchor {
  const win = doc.defaultView!;
  const root = doc.documentElement;
  const hit = doc.elementFromPoint(x, y);
  const element = hit && hit !== doc.body && hit !== root ? hit : null;
  const rect = element?.getBoundingClientRect();
  return {
    screen: doc.location.pathname,
    state: stateOf(doc.location, studioOwns),
    page: pageKey(doc),
    selector: element ? selectorFor(element) : null,
    text: element ? snippet(element) || undefined : undefined,
    shape: element ? shapeFor(element) : undefined,
    x: rect && rect.width ? clamp((x - rect.left) / rect.width) : 0,
    y: rect && rect.height ? clamp((y - rect.top) / rect.height) : 0,
    fx: clamp((x + win.scrollX) / Math.max(1, root.scrollWidth)),
    fy: clamp((y + win.scrollY) / Math.max(1, root.scrollHeight)),
  };
}

/** The element an anchor was made on, if it is on screen now: there, showing, and still saying what it said. */
export function elementOf(doc: Document, anchor: Anchor): Element | null {
  if (!anchor.selector) return null;
  let element: Element | null = null;
  try {
    element = doc.querySelector(anchor.selector);
  } catch {
    // A selector that no longer parses is an element that is gone.
  }
  if (!element) return null;
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  if (anchor.text && snippet(element) !== anchor.text) return null;
  return element;
}

/**
 * For a comment whose element isn't there as it was, the same element showing something else. A prototype can read
 * differently for whoever opens it (a quiz's results are built from the answers in the commenter's own browser), so
 * asked for, a comment goes to: the element at its path; else one of its kind (`shapeFor`), the one saying what it
 * said if there is one; else the deepest part of its path that is there. `depth` says how near, to compare screens.
 */
export function nearestOf(doc: Document, anchor: Anchor): { element: Element; depth: number } | null {
  if (!anchor.selector) return null;
  const showing = (element: Element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const all = (selector: string) => {
    try {
      return [...doc.querySelectorAll(selector)].filter(showing);
    } catch {
      // A selector that no longer parses matches nothing.
      return [];
    }
  };
  const parts = anchor.selector.split(" > ");
  const at = all(anchor.selector)[0];
  if (at) return { element: at, depth: parts.length };
  const kind = anchor.shape ? all(anchor.shape) : [];
  const like = kind.find((element) => anchor.text && snippet(element) === anchor.text) ?? kind[0];
  if (like) return { element: like, depth: parts.length - 0.5 };
  for (let depth = parts.length - 1; depth > 1; depth--) {
    const element = all(parts.slice(0, depth).join(" > "))[0];
    if (element) return { element, depth };
  }
  return null;
}

/**
 * Scrolls a document so an anchor's point is in the middle of the view: the element into view, then whatever scrolls
 * it, by what is left. The point and not the element, since an element can be taller than the screen.
 */
export function bringIntoView(doc: Document, element: Element, anchor: Anchor) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const win = doc.defaultView!;
  const rect = element.getBoundingClientRect();
  const off = rect.top + anchor.y * rect.height - win.innerHeight / 2;
  if (Math.abs(off) < 1) return;
  for (let node = element.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    if (/auto|scroll|overlay/.test(win.getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
      node.scrollBy(0, off);
      return;
    }
  }
  win.scrollBy(0, off);
}

/**
 * Where an anchor is in a document, in its own pixels, or null when it isn't
 * on this screen right now. A prototype can swap one step for another without
 * changing page, or draw a step over the one before, so a comment shows only
 * where its element is there, uncovered, and the page reads as it did.
 */
export function spotOf(
  doc: Document,
  anchor: Anchor,
  page = pageKey(doc),
  /** The comment asked for: shown at the nearest thing there (`nearestOf`) when its own element isn't, as not `exact`. */
  near = false,
): Found | null {
  if (anchor.screen !== doc.location.pathname) return null;
  const samePage = !anchor.page || anchor.page === page;
  if (!near && !samePage) return null;
  if (!anchor.selector) {
    const root = doc.documentElement;
    const win = doc.defaultView!;
    return {
      x: anchor.fx * root.scrollWidth - win.scrollX,
      y: anchor.fy * root.scrollHeight - win.scrollY,
      exact: samePage,
    };
  }
  const exact = elementOf(doc, anchor);
  const element = exact ?? (near ? (nearestOf(doc, anchor)?.element ?? null) : null);
  const rect = element?.getBoundingClientRect();
  if (!element || !rect || !(rect.width || rect.height)) return null;
  const spot = {
    x: rect.left + anchor.x * rect.width,
    y: rect.top + anchor.y * rect.height,
  };
  // It has to be what you would see there: a step drawn over the top of it, or the page scrolled past it, hides the pin.
  const hit = doc.elementFromPoint(spot.x, spot.y);
  if (!hit || !(element.contains(hit) || hit.contains(element))) return null;
  return { ...spot, exact: !!exact && samePage };
}
