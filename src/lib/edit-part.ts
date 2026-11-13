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
};

export function describePart(element: Element): Part {
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
  const left = new Map<Element, Left>();

  const keep = (docs: Document[], edits: Edit[]) => {
    const wanted = new Map<Element, Edit[]>();
    for (const doc of docs) {
      for (const edit of edits) {
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
        } else {
          const shown = picture?.(edit.src);
          if (shown) setPicture(element, shown);
        }
      }
      left.set(element, { edits: signature, ...lookOf(element, hasWords(signature)) });
    }
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
