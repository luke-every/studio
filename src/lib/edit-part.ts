import { pictureOf, selectorFor, setPicture, sizeProperties, sizingOf, textOf, writeText, type Axis, type Sizing } from "@/lib/edit-dom";
import type { Edit } from "@/lib/edits";

/**
 * A part of a prototype picked to edit, and drawing edits onto its page: the two things edit mode does to a page's
 * own document. Plain DOM code with nothing of the studio's in it, because it runs in two places: here, on a page the
 * studio serves and can reach into, and inside a live version's page (see `comment-bridge.ts`), which is on another
 * address and is asked by message. Either way the panel is given the same description of a part and the page is drawn
 * from the same list of edits, so the two never differ.
 */

/** Every property the edit panel reads. One it reads that isn't here comes back empty, so add it here first. */
const PROPERTIES = [
  "align-items", "align-self", "backdrop-filter", "background-color", "border-bottom-left-radius", "border-bottom-right-radius",
  "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-top-style", "border-top-width", "bottom",
  "box-shadow", "color", "column-gap", "display", "filter", "flex-direction", "flex-grow", "flex-wrap", "font-family", "font-size",
  "font-style", "font-weight", "height", "justify-content", "left", "letter-spacing", "line-height", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "opacity", "overflow-x", "padding-bottom", "padding-left", "padding-right", "padding-top", "position",
  "right", "row-gap", "text-align", "text-decoration-line", "text-transform", "top", "visibility", "width", "z-index",
];

const AXES: Axis[] = ["width", "height"];
const SIZINGS: Sizing[] = ["fixed", "fill", "hug"];

/** A part as the panel needs it: what it is, how it looks now, and what each choice of sizing would set. Plain data, so it can be sent from a page on another address. */
export type Part = {
  selector: string;
  tag: string;
  /** The computed value of each of `PROPERTIES`. */
  css: Record<string, string>;
  /** How its parent lays its children out, or empty when it has none. */
  parentDisplay: string;
  /** Its words, when they can be edited as plain lines (see `textOf`); and whether it holds any text of its own at all. */
  text: string | null;
  hasText: boolean;
  /** The element whose picture a swap here would change (see `pictureOf`), by selector. */
  picture: string | null;
  sizing: Record<Axis, Sizing>;
  /** The properties each sizing along each axis would set (see `sizeProperties`). */
  sizes: Record<Axis, Record<Sizing, [string, string][]>>;
  /** Where it is in its page's window, in the page's own pixels. */
  box: { left: number; top: number; width: number; height: number };
  /** Set when it is the root of a design-system component instance (a live version): what it is, and its props that are plain values. */
  component?: { name: string; props: Record<string, string | number | boolean>; preview: boolean };
};

type Fiber = { type?: unknown; return?: Fiber | null; child?: Fiber | null; sibling?: Fiber | null; stateNode?: unknown; memoizedProps?: Record<string, unknown>; _debugOwner?: Fiber | null };

const fiberOf = (element: Element) => {
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
  return key ? ((element as unknown as Record<string, Fiber | null>)[key] ?? null) : null;
};
const nameOf = (fiber: Fiber) => {
  const type = fiber.type as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | string | undefined;
  return type && typeof type !== "string" ? type.displayName || type.name || type.render?.name || type.type?.name || "" : "";
};
const hostOf = (fiber: Fiber | null | undefined): Element | null => {
  for (let at = fiber?.child; at; at = at.sibling) {
    const found = typeof at.type === "string" && at.stateNode instanceof Element ? at.stateNode : hostOf(at);
    if (found) return found;
  }
  return null;
};

/**
 * The design-system component an element of a React dev build belongs to, if any: its root element, name and props.
 * It belongs to the components that rendered it (React's dev-only owner chain, so a page's own elements passed in as
 * children don't); of those, the outermost run of design-system ones is the instance, so an icon inside a Button is
 * the Button. A production build has no owners, and so never finds one.
 */
export function componentOf(element: Element, names: Set<string>) {
  let outer: Fiber | null = null;
  for (let owner = fiberOf(element)?._debugOwner ?? null; owner && names.has(nameOf(owner)); owner = owner._debugOwner ?? null) outer = owner;
  if (!outer) return null;
  // The owner may be a copy of the fiber from an earlier render: the live one is the same component above the element.
  let instance: Fiber | null = fiberOf(element)?.return ?? null;
  while (instance && instance.type !== outer.type) instance = instance.return ?? null;
  const root = hostOf(instance ?? outer);
  if (!root) return null;
  const props: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries((instance ?? outer).memoizedProps ?? {})) {
    if ((key !== "children" || typeof value === "string") && ["string", "number", "boolean"].includes(typeof value)) props[key] = value as string | number | boolean;
  }
  return { root, name: nameOf(outer), props, fiber: (instance ?? outer) as Fiber };
}

type Renderer = { overrideProps?: (fiber: Fiber, path: string[], value: unknown) => void };

/** React's own way of changing a prop on a mounted component, if the page set up the hook that hands it over (a dev build, with the studio's stub or React DevTools loaded first). */
const rendererOf = (): Renderer | null => {
  const hook = (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<unknown, Renderer> } }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  for (const renderer of hook?.renderers?.values() ?? []) if (typeof renderer.overrideProps === "function") return renderer;
  return null;
};

/**
 * Shows prop edits on the running page: each is put on its component instance with React's `overrideProps`, and the
 * prop's first value is kept so an edit that goes away puts it back. Safe to call whenever the page may have drawn
 * itself again, since a parent re-rendering takes an override with it: it only overrides where the prop differs.
 */
export function propPreview() {
  const originals = new Map<string, { element: Element; prop: string; value: unknown; names: Set<string> }>();
  return (docs: Document[], edits: Edit[]) => {
    const renderer = rendererOf();
    if (!renderer) return;
    // What each instance should have, together: an override starts from the props the last render left, so two in a row would lose the first.
    const targets = new Map<Fiber, Record<string, unknown>>();
    const want = (element: Element, names: Set<string>, prop: string, value: unknown) => {
      const fiber = componentOf(element, names)?.fiber;
      if (fiber && fiber.memoizedProps?.[prop] !== value) targets.set(fiber, { ...targets.get(fiber), [prop]: value });
    };
    const wanted = new Set<string>();
    for (const edit of edits) {
      if (edit.kind !== "prop") continue;
      const key = `${edit.selector}\0${edit.prop}`;
      const names = new Set([edit.component]);
      const element = docs.map((doc) => partIn(doc, edit.selector)).find(Boolean);
      const found = element && componentOf(element, names);
      if (!element || !found) continue;
      wanted.add(key);
      if (!originals.has(key)) originals.set(key, { element, prop: edit.prop, value: found.fiber.memoizedProps?.[edit.prop], names });
      const was = originals.get(key)!.value;
      // The prop keeps the type it had: a number stays a number, a boolean a boolean.
      want(element, names, edit.prop, typeof was === "number" ? Number(edit.value) : typeof was === "boolean" ? edit.value === true || edit.value === "true" : edit.value);
    }
    for (const [key, { element, prop, value, names }] of originals) {
      if (wanted.has(key)) continue;
      if (element.isConnected) want(element, names, prop, value);
      originals.delete(key);
    }
    for (const [fiber, props] of targets) renderer.overrideProps!(fiber, [], { ...fiber.memoizedProps, ...props });
  };
}

/** `names` are the design system's components: an element inside one is described as that component instance, by its root. */
export function describePart(picked: Element, names?: string[]): Part {
  const found = names?.length ? componentOf(picked, new Set(names)) : null;
  const element = found?.root ?? picked;
  const computed = element.ownerDocument.defaultView!.getComputedStyle(element);
  const css = Object.fromEntries(PROPERTIES.map((property) => [property, computed.getPropertyValue(property).trim()]));
  const parent = element.parentElement;
  const picture = pictureOf(element);
  const rect = element.getBoundingClientRect();
  const each = <T,>(make: (axis: Axis) => T) => Object.fromEntries(AXES.map((axis) => [axis, make(axis)])) as Record<Axis, T>;
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    css,
    parentDisplay: parent ? element.ownerDocument.defaultView!.getComputedStyle(parent).display : "",
    text: textOf(element),
    hasText: [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()),
    picture: picture ? selectorFor(picture) : null,
    sizing: each((axis) => sizingOf(element, axis)),
    sizes: each((axis) => Object.fromEntries(SIZINGS.map((mode) => [mode, sizeProperties(element, axis, mode, parseFloat(css[axis]) || 0)])) as Record<Sizing, [string, string][]>),
    box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    component: found ? { name: found.name, props: found.props, preview: !!rendererOf() } : undefined,
  };
}

/** The element a selector names in a document, or null: a selector that no longer parses names nothing. */
export function partIn(doc: Document, selector: string) {
  try {
    return doc.querySelector(selector);
  } catch {
    return null;
  }
}

type Original = { style: string | null; html: string; src: string | null };
/** How an element was left after its edits were last put on it, to tell when the page has changed it since. */
type Left = { edits: string; style: string | null; html: string; src: string | null };

/** Its markup is only read when its words are what was edited: reading a big element's whole markup each time the page moves is slow. */
const lookOf = (element: Element, words: boolean) => ({ style: element.getAttribute("style"), html: words ? element.innerHTML : "", src: element.getAttribute("src") });
const hasWords = (signature: string) => signature.includes('"kind":"text"');

/**
 * Draws a list of edits onto documents, remembering how each element it touches looked before, so the list can change
 * (or empty) and the page follow: the list is the truth, and the page is drawn from it. `picture` gives the address to
 * show for an image edit, when there is one to show.
 *
 *  - `paint` puts every touched element back as it was and applies the list: for when the list has changed.
 *  - `keep` applies the list only where it isn't on the page as it was left: for when the page may have changed itself
 *    (a framework drawing again), which must not undo an edit. It changes nothing when nothing needs it, so it is safe
 *    to call whenever the page says it changed.
 */
export function painter(picture?: (src: string) => string | undefined) {
  const originals = new Map<Element, Original>();
  const preview = propPreview();
  const left = new Map<Element, Left>();

  const keep = (docs: Document[], edits: Edit[]) => {
    const wanted = new Map<Element, Edit[]>();
    for (const doc of docs) {
      for (const edit of edits) {
        // A prop isn't drawn on the element: `preview` puts it on its component instead.
        if (edit.kind === "prop") continue;
        const element = partIn(doc, edit.selector);
        if (element) wanted.set(element, [...(wanted.get(element) ?? []), edit]);
      }
    }
    for (const [element, list] of wanted) {
      const signature = JSON.stringify(list);
      const was = left.get(element);
      const now = lookOf(element, hasWords(signature));
      if (was && was.edits === signature && was.style === now.style && was.html === now.html && was.src === now.src) continue;
      if (!originals.has(element)) originals.set(element, lookOf(element, true));
      for (const edit of list) {
        if (edit.kind === "style") {
          for (const [property, value] of Object.entries(edit.css)) (element as HTMLElement).style.setProperty(property, value, "important");
        } else if (edit.kind === "text") {
          writeText(element, edit.text);
        } else if (edit.kind === "image") {
          const shown = picture?.(edit.src);
          if (shown) setPicture(element, shown);
        }
      }
      left.set(element, { edits: signature, ...lookOf(element, hasWords(signature)) });
    }
    preview(docs, edits);
  };

  const paint = (docs: Document[], edits: Edit[]) => {
    for (const [element, original] of originals) {
      if (original.style === null) element.removeAttribute("style");
      else element.setAttribute("style", original.style);
      // Only what a text edit rewrote is written back: writing an element's markup again makes new elements of
      // everything inside it, which the page's own code no longer knows.
      if (hasWords(left.get(element)?.edits ?? "")) element.innerHTML = original.html;
      if (original.src === null) element.removeAttribute("src");
      else element.setAttribute("src", original.src);
    }
    originals.clear();
    left.clear();
    keep(docs, edits);
  };

  return { paint, keep };
}
