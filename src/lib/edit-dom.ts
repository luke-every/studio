/**
 * Reading and changing elements inside a prototype's own document, for edit
 * mode. `instanceof` is avoided throughout: a node from the prototype's window
 * isn't an instance of this window's classes.
 */

const isElement = (node: Node): node is Element => node.nodeType === Node.ELEMENT_NODE;

/**
 * A path to an element that will find the same one again: its id when that is
 * unique, otherwise tag and position at every level from the body down.
 * Structural, so it can stop matching if the markup around it changes; an
 * edit that no longer matches is skipped, never an error.
 */
export function selectorFor(element: Element): string {
  const doc = element.ownerDocument;
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== doc.body && node !== doc.documentElement) {
    if (node.id && doc.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      return parts.join(" > ");
    }
    const tag = node.tagName.toLowerCase();
    const same = [...(node.parentElement?.children ?? [])].filter((sibling) => sibling.tagName === node!.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    node = node.parentElement;
  }
  return ["body", ...parts].join(" > ");
}

/** Text that can be edited as plain lines: no child elements except line breaks. */
export function textOf(element: Element): string | null {
  let text = "";
  for (const node of element.childNodes) {
    if (node.nodeName === "BR") text += "\n";
    else if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    else if (isElement(node)) return null;
  }
  return text.trim() ? text : null;
}

export function writeText(element: Element, text: string) {
  const doc = element.ownerDocument;
  element.replaceChildren(
    ...text.split("\n").flatMap((line, i) => (i ? [doc.createElement("br"), doc.createTextNode(line)] : [doc.createTextNode(line)])),
  );
}

/** Whether a picture can be swapped here: an <img>, or something with a background image. */
export function isPicture(element: Element) {
  if (element.tagName === "IMG") return true;
  return element.ownerDocument.defaultView!.getComputedStyle(element).backgroundImage.includes("url(");
}

/**
 * The element whose picture a click on `element` should swap: itself, or the
 * nearest one around it with a background image, since the thing clicked is
 * often text or a button sitting on top of the picture.
 */
export function pictureOf(element: Element): Element | null {
  for (let at: Element | null = element; at && at !== at.ownerDocument.body && at !== at.ownerDocument.documentElement; at = at.parentElement) {
    if (isPicture(at)) return at;
  }
  return null;
}

export function setPicture(element: Element, src: string) {
  if (element.tagName === "IMG") {
    element.removeAttribute("srcset");
    element.setAttribute("src", src);
  } else {
    (element as HTMLElement).style.setProperty("background-image", `url("${src}")`, "important");
  }
}

export type Axis = "width" | "height";
export type Sizing = "fixed" | "fill" | "hug";

/** Sets some inline properties for a moment, runs `measure`, and puts them back as they were. */
function probing<T>(element: HTMLElement, changes: [string, string][], measure: () => T): T {
  const was = changes.map(([property]) => [property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)] as const);
  for (const [property, value] of changes) element.style.setProperty(property, value, "important");
  const result = measure();
  for (const [property, value, priority] of was) {
    if (value) element.style.setProperty(property, value, priority);
    else element.style.removeProperty(property);
  }
  return result;
}

/**
 * How an element is sized along one axis, as a designer would say it rather
 * than as the browser reports it (which is always pixels):
 *
 *   fixed  it has a size of its own
 *   fill   it takes the room its parent gives it
 *   hug    it is only as big as what is inside it
 *
 * Found by trying: with no size of its own, does it still come out the same?
 * Then, if it is made to wrap its content, does it still?
 */
export function sizingOf(element: Element, axis: Axis): Sizing {
  const el = element as HTMLElement;
  const size = () => (axis === "width" ? el.getBoundingClientRect().width : el.getBoundingClientRect().height);
  const now = size();
  // A pixel size set on the element itself is a size of its own, even if it happens to match what filling would give.
  if (/^[\d.]+px$/.test(el.style.getPropertyValue(axis))) return "fixed";
  if (Math.abs(probing(el, [[axis, "auto"]], size) - now) > 1) return "fixed";

  const row = !/column/.test(el.parentElement ? getComputedStyle(el.parentElement).flexDirection : "");
  const main = axis === "width" ? row : !row;
  const hugging: [string, string][] = [[main ? "flex-grow" : "align-self", main ? "0" : "flex-start"]];
  if (axis === "width") hugging.push(["width", "fit-content"]);
  const wraps = Math.abs(probing(el, hugging, size) - now) <= 1;

  // A paragraph that runs the whole width wraps its content too, but is filling.
  const parent = el.parentElement;
  if (wraps && parent && axis === "width") {
    const style = getComputedStyle(parent);
    const room = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (Math.abs(room - now) <= 1) return "fill";
  }
  return wraps ? "hug" : "fill";
}

/** The properties that give an element `mode` sizing along `axis`; `px` is the size to hold when fixed. */
export function sizeProperties(element: Element, axis: Axis, mode: Sizing, px: number): [string, string][] {
  const parent = element.parentElement;
  const display = parent ? getComputedStyle(parent) : null;
  const flex = !!display && /flex|grid/.test(display.display);
  const row = !display || !/column/.test(display.flexDirection);
  const main = axis === "width" ? row : !row;

  if (mode === "fixed") return [[axis, `${Math.round(px * 100) / 100}px`], ...(flex && main ? ([["flex-grow", "0"]] as [string, string][]) : [])];
  if (mode === "hug") return [[axis, "fit-content"], ...(flex ? ([main ? ["flex-grow", "0"] : ["align-self", "flex-start"]] as [string, string][]) : [])];
  // fill
  if (!flex) return [[axis, "100%"]];
  return [[axis, "auto"], main ? ["flex-grow", "1"] : ["align-self", "stretch"]];
}

/** A box shadow, the first layer of it: what the panel lets you change. */
export type Shadow = { x: number; y: number; blur: number; spread: number; color: string };

/** The first shadow of a computed `box-shadow` (colour first, as the browser writes it), or null for none. */
export function parseShadow(value: string): Shadow | null {
  const match = value.match(/^(rgba?\([^)]*\)|#[\da-f]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/i);
  if (!match || /\binset\b/.test(value.split(/,(?![^(]*\))/)[0])) return null;
  return { color: match[1], x: +match[2], y: +match[3], blur: +match[4], spread: +(match[5] ?? 0) };
}

export const shadowCss = (s: Shadow) => `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px ${s.color}`;

/** `rgb(…)` or `rgba(…)` as its parts, the alpha being 1 when not given. */
export function rgbaOf(color: string): [number, number, number, number] {
  const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b, a];
}

export const toRgba = (r: number, g: number, b: number, a: number) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;

/** `rgb(…)` as the `#rrggbb` a colour input wants. */
export function toHex(color: string) {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Type into an element where it sits. Plain text only, so nothing else can
 * creep into the markup. Enter makes a new line; clicking away or ⌘/Ctrl+Enter
 * finishes, and Escape puts it back. The element is restored before `done`
 * is told, so the change is made once, the same way as any other edit.
 */
export function editInPlace(element: HTMLElement, done: (text: string) => void) {
  const before = textOf(element);
  if (before === null) return;
  const original = element.innerHTML;
  const doc = element.ownerDocument;

  element.setAttribute("contenteditable", "plaintext-only");
  element.focus();
  const range = doc.createRange();
  range.selectNodeContents(element);
  const selection = doc.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  let cancelled = false;
  const typed = () => {
    let text = "";
    for (const node of element.childNodes) text += node.nodeName === "BR" ? "\n" : (node.textContent ?? "");
    return text.replace(/\n$/, "");
  };
  const keys = (event: KeyboardEvent) => {
    // Keys are for the text, not for anything the prototype listens for.
    event.stopPropagation();
    if (event.key === "Escape") {
      cancelled = true;
      element.blur();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      element.blur();
    }
  };
  const finish = () => {
    element.removeEventListener("keydown", keys);
    element.removeEventListener("blur", finish);
    const text = typed();
    element.removeAttribute("contenteditable");
    element.innerHTML = original;
    if (!cancelled && text !== before) done(text);
  };
  element.addEventListener("keydown", keys);
  element.addEventListener("blur", finish);
}
