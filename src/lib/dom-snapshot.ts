import { rootOf } from "@/lib/anchor";
import { selectorFor } from "@/lib/edit-dom";
import { componentOf, tokensOf, type Tokens } from "@/lib/edit-part";

/**
 * A page as plain DOM: every element carries the styles it was actually drawn with, so the result needs no stylesheet, no
 * script and no media query. It is the shape Paper's canvas has (static nodes with inline styles in one document), made
 * from a real running page, so that many screens can sit in one document instead of one iframe each.
 *
 * What it keeps: the elements (all of them, hidden ones as empty shells, under their own tag names and ids, so a path to an
 * element finds the same one on the page and on the copy), their text, images (at the address they actually loaded),
 * `data-*` attributes (the prototype's source tags ride on those), SVG, and the `::before` / `::after` that draw
 * something. What it can't keep: what the page's own script does afterwards (a carousel moving, a menu opening), video,
 * canvas, and anything inside another frame; they are left as an empty box of the same size.
 *
 * It reads the page's computed styles, so the page has to be on the studio's own address (the studio can't look inside a
 * page on another port). Capture happens in a hidden frame of the screen's own width, so every breakpoint is already
 * resolved when it is read.
 */

/** How faithful a copy is, measured against the page it was read from (see `verify`). */
export type Check = {
  elements: number;
  /** Elements whose box is within 2px of the live page's, in the same place and size. */
  sameBoxes: number;
  selectors: { checked: number; same: number };
  /** The shallowest elements whose box differs: the ones that cause the rest. */
  worst: { tag: string; id: string; text: string; live: number[]; copy: number[]; selector: string }[];
  /** Selectors that differ, so a comment or edit made on the copy wouldn't find the same element on the page. */
  differentSelectors: { live: string; copy: string }[];
  ms: number;
};

/**
 * Where every element of a copy is, in the page's own pixels, and how they nest, recorded while the page was live. What is under a
 * point is then plain arithmetic, however the copy is scaled or moved on the canvas (see copy-page.ts). Element `n` is the one
 * whose copy carries `data-ix="n"`; 0 is the body.
 */
export type Geometry = {
  count: number;
  /** left, top, width, height for each element, from the body's top left. */
  boxes: Float32Array;
  /** Each element's parent, or -1. */
  parent: Int32Array;
  /** 1 where it is big enough and drawn to be picked (the page's own test, see `anchor.ts`). */
  drawn: Uint8Array;
  /** 1 where a pointer can land on it (not `pointer-events: none`, not hidden). */
  hittable: Uint8Array;
  /** The page's real root, below the wrappers that hold one child and nothing else. */
  root: number;
  /** The design-system components on the page (a dev build tells which; see `componentOf`): each one's name, its root element and its plain props. */
  components: { name: string; root: number; props: Record<string, string | number | boolean> }[];
  /** For each element, which of `components` it is, or is inside (the page's own elements passed in as children aren't), or -1. */
  inComponent: Int32Array;
};

export type Snapshot = {
  html: string;
  /** The page's `@font-face` rules, with their addresses made absolute, for the document that shows the snapshot. */
  fonts: string;
  width: number;
  height: number;
  background: string;
  nodes: number;
  truncated: boolean;
  ms: number;
  geometry: Geometry;
  /** The page's design tokens, read where it ran: a copy has no stylesheets to read them from. */
  tokens: Tokens;
  check?: Check;
};

const MAX_NODES = 20000;
const SVG = "http://www.w3.org/2000/svg";
const SKIP = new Set(["script", "style", "link", "meta", "noscript", "template", "iframe", "object", "embed", "title", "head", "source", "track"]);
const VOID = new Set(["img", "br", "hr", "input", "wbr"]);
/** Only what the HTML parser would drop or move: every other element keeps its own name, so a path of tags still finds it. */
const RENAMED: Record<string, string> = { body: "div", html: "div" };
/** Properties that describe behaviour, not appearance. (A scrollbar's width is appearance: it takes room.) */
const DROP = /^(transition|animation|will-change|cursor|pointer-events|user-select|-webkit-user-select|caret-color|scroll-behavior|scroll-snap|scroll-padding|scroll-margin|scroll-timeline|overscroll|touch-action|-webkit-tap-highlight|view-transition|container|anchor|interpolate|-webkit-font-smoothing)/;

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

type Context = {
  view: Window & typeof globalThis;
  baseline: (tag: string, svg: boolean) => CSSStyleDeclaration;
  nodes: number;
  truncated: boolean;
  /** Every element that was copied, in order (each copy carries its number as `data-ix`). */
  index: Element[];
  /** What the geometry needs of each that isn't in its box. */
  flags: { contents: boolean; hittable: boolean }[];
};

/**
 * What differs from an element of the same kind in an empty page, as a style attribute.
 *
 * Some values are only what they are because of another: a border's width computes to 0px while its style is `none`. So
 * when a border or outline is drawn, its width and colour are kept whether or not they match the empty page's, or the
 * browser would fill them in with its own (a 3px black frame).
 */
function differences(style: CSSStyleDeclaration, base: CSSStyleDeclaration) {
  const kept = new Set<string>();
  let css = "";
  const keep = (name: string) => {
    if (kept.has(name)) return;
    kept.add(name);
    css += `${name}:${style.getPropertyValue(name)};`;
  };
  for (let index = 0; index < style.length; index++) {
    const name = style[index];
    if (DROP.test(name)) continue;
    if (style.getPropertyValue(name) !== base.getPropertyValue(name)) keep(name);
  }
  for (const side of ["top", "right", "bottom", "left"]) {
    if (style.getPropertyValue(`border-${side}-style`) === "none") continue;
    keep(`border-${side}-style`);
    keep(`border-${side}-width`);
    keep(`border-${side}-color`);
  }
  if (style.getPropertyValue("outline-style") !== "none") {
    keep("outline-style");
    keep("outline-width");
    keep("outline-color");
    keep("outline-offset");
  }
  return css;
}

/** The text a pseudo-element draws, or null if it draws nothing. */
function pseudo(element: Element, which: "::before" | "::after", context: Context) {
  const style = context.view.getComputedStyle(element, which);
  const content = style.getPropertyValue("content");
  if (!content || content === "none" || content === "normal" || style.display === "none") return "";
  const text = /^"([\s\S]*)"$/.exec(content)?.[1] ?? /^'([\s\S]*)'$/.exec(content)?.[1] ?? "";
  context.nodes++;
  // Not a span: a real span beside it would find its position among the spans changed, and with it the path to it.
  return `<x-pseudo style="${escapeAttribute(differences(style, context.baseline("span", false)))}">${escapeText(text.replace(/\\(["'\\])/g, "$1"))}</x-pseudo>`;
}

function serialize(element: Element, context: Context): string {
  if (context.nodes >= MAX_NODES) {
    context.truncated = true;
    return "";
  }
  const tag = element.localName;
  if (SKIP.has(tag)) return "";
  // A custom element with a shadow root is a widget of its own (the framework's error overlay, say): not part of the page.
  if (tag.includes("-") && element.shadowRoot) return "";
  const svg = element.namespaceURI === SVG;
  const style = context.view.getComputedStyle(element);
  context.nodes++;

  const out = RENAMED[tag] ?? tag;
  let attributes = "";
  // Every element is numbered, and the first (the body) marks itself as the top: how a copy is read back (see copy-page.ts).
  if (context.index.length === 0) attributes += " data-studio-root";
  attributes += ` data-ix="${context.index.length}"`;
  context.flags.push({ contents: style.display === "contents", hittable: style.pointerEvents !== "none" && style.visibility !== "hidden" });
  context.index.push(element);
  if (svg) {
    for (const attribute of Array.from(element.attributes)) if (attribute.name !== "class" && attribute.name !== "style") attributes += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
  } else {
    // The id stays (a path to an element starts from one); the class doesn't, since nothing here is styled by one.
    for (const attribute of Array.from(element.attributes)) if (attribute.name === "id" || attribute.name.startsWith("data-")) attributes += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
  }
  // Hidden: an empty shell, so the siblings after it keep their positions (and so their paths), and an accordion's closed
  // panel is still there for the copy taken after it is opened.
  if (style.display === "none") return VOID.has(tag) ? `<${out}${attributes} style="display:none">` : `<${out}${attributes} style="display:none"></${out}>`;
  if (!svg) {
    // Not `instanceof`: these elements belong to the frame's window, which has its own HTMLImageElement and the rest.
    if (tag === "img") {
      const image = element as HTMLImageElement;
      attributes += ` src="${escapeAttribute(image.currentSrc || image.src)}" alt="${escapeAttribute(image.alt)}"`;
    }
    if (tag === "input") {
      const input = element as HTMLInputElement;
      attributes += ` type="${escapeAttribute(input.type)}" value="${escapeAttribute(input.value)}"${input.checked ? " checked" : ""}`;
    }
  }
  const open = `<${out}${attributes} style="${escapeAttribute(differences(style, context.baseline(tag, svg)))}">`;
  if (VOID.has(tag)) return open;
  // A video or canvas can't be copied: its box is, with whatever it paints behind it (a poster is its background).
  if (tag === "video" || tag === "canvas" || tag === "audio") return `${open}</${out}>`;
  if (tag === "textarea") return `${open}${escapeText((element as HTMLTextAreaElement).value)}</${out}>`;

  let inner = svg ? "" : pseudo(element, "::before", context);
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) inner += escapeText((child as Text).data);
    else if (child.nodeType === 1) inner += serialize(child as Element, context);
  }
  if (!svg) inner += pseudo(element, "::after", context);
  return `${open}${inner}</${out}>`;
}

/** The page's `@font-face` rules, with every address made absolute. */
function fontRules(doc: Document) {
  const rules: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      // A stylesheet from another address can't be read.
      continue;
    }
    const base = sheet.href ?? doc.baseURI;
    for (const rule of Array.from(list)) {
      if (rule.type !== 5) continue;
      rules.push(
        rule.cssText.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote: string, address: string) => {
          if (/^(data:|https?:|blob:)/.test(address)) return match;
          try {
            return `url(${quote}${new URL(address, base).href}${quote})`;
          } catch {
            return match;
          }
        }),
      );
    }
  }
  return rules.join("\n");
}

const boxOf = (element: Element, origin: DOMRect) => {
  const box = element.getBoundingClientRect();
  return [box.left - origin.left, box.top - origin.top, box.width, box.height].map((value) => Math.round(value * 10) / 10);
};

/**
 * Puts the copy in this document, off screen at the same width, and compares it with the page it came from, element by
 * element: is each box in the same place and the same size, and would the path to each element be the same? A comment or
 * an edit made on a copy is only worth anything if the page finds the same element again.
 */
async function verify(doc: Document, html: string, fonts: string, index: Element[], width: number): Promise<Check> {
  const started = performance.now();
  const style = document.createElement("style");
  style.textContent = fonts;
  const host = document.createElement("div");
  // `contain` makes the host what a fixed element is placed against, as it is on the canvas; without it they'd be measured against the window.
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;contain:content`;
  document.head.appendChild(style);
  document.body.appendChild(host);
  try {
    const shadow = host.attachShadow({ mode: "open" });
    const made = document.createElement("template");
    made.innerHTML = html;
    shadow.appendChild(made.content.cloneNode(true));
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const root = shadow.firstElementChild;
    if (!root) throw new Error("The copy is empty.");
    const copies = new Map<number, Element>();
    for (const element of Array.from(shadow.querySelectorAll("[data-ix]"))) copies.set(Number(element.getAttribute("data-ix")), element);

    const liveOrigin = doc.body.getBoundingClientRect();
    const copyOrigin = root.getBoundingClientRect();
    const different: (Check["worst"][number] & { depth: number })[] = [];
    const selectors: Check["differentSelectors"] = [];
    let sameBoxes = 0;
    let sameSelectors = 0;
    let checked = 0;
    for (let at = 0; at < index.length; at++) {
      const live = index[at];
      const copy = copies.get(at);
      if (!copy) continue;
      checked++;
      const [a, b] = [boxOf(live, liveOrigin), boxOf(copy, copyOrigin)];
      if (a.every((value, position) => Math.abs(value - b[position]) <= 2)) sameBoxes++;
      else {
        let depth = 0;
        for (let up = live.parentElement; up; up = up.parentElement) depth++;
        different.push({ depth, tag: live.localName, id: live.id, text: (live.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 36), live: a, copy: b, selector: selectorFor(live) });
      }
      const [x, y] = [selectorFor(live), selectorFor(copy, root)];
      if (x === y) sameSelectors++;
      else if (selectors.length < 5) selectors.push({ live: x, copy: y });
    }
    different.sort((p, q) => p.depth - q.depth);
    return { elements: checked, sameBoxes, selectors: { checked, same: sameSelectors }, worst: different.slice(0, 8).map((item) => ({ tag: item.tag, id: item.id, text: item.text, live: item.live, copy: item.copy, selector: item.selector })), differentSelectors: selectors, ms: performance.now() - started };
  } finally {
    host.remove();
    style.remove();
  }
}

/** Every copied element's box and place in the tree, read from the live page. */
function geometryOf(doc: Document, context: Context, names: string[] | null): Geometry {
  const { index, flags } = context;
  const at = new Map<Element, number>();
  index.forEach((element, ix) => at.set(element, ix));
  const origin = doc.body.getBoundingClientRect();
  const boxes = new Float32Array(index.length * 4);
  const parent = new Int32Array(index.length).fill(-1);
  const drawn = new Uint8Array(index.length);
  const hittable = new Uint8Array(index.length);
  const components: Geometry["components"] = [];
  const inComponent = new Int32Array(index.length).fill(-1);
  const known = names?.length ? new Set(names) : null;
  const instances = new Map<Element, number>();
  index.forEach((element, ix) => {
    const rect = element.getBoundingClientRect();
    boxes.set([rect.left - origin.left, rect.top - origin.top, rect.width, rect.height], ix * 4);
    for (let up = element.parentElement; up; up = up.parentElement) {
      const found = at.get(up);
      if (found !== undefined) {
        parent[ix] = found;
        break;
      }
    }
    drawn[ix] = rect.width >= 8 && rect.height >= 8 && !flags[ix].contents ? 1 : 0;
    hittable[ix] = flags[ix].hittable ? 1 : 0;
    const found = known ? componentOf(element, known) : null;
    const root = found ? at.get(found.root) : undefined;
    if (found && root !== undefined) {
      // One entry per instance, however many of its elements there are.
      let which = instances.get(found.root);
      if (which === undefined) {
        which = components.push({ name: found.name, root, props: found.props }) - 1;
        instances.set(found.root, which);
      }
      inComponent[ix] = which;
    }
  });
  return { count: index.length, boxes, parent, drawn, hittable, root: at.get(rootOf(doc)) ?? 0, components, inComponent };
}

/** Reads the page that has loaded in `frame`, at the width it is drawn at. With `check`, also measures how faithful the copy is. */
export async function snapshotOf(frame: HTMLIFrameElement, options: { check?: boolean; components?: string[] | null } = {}): Promise<Snapshot> {
  const started = performance.now();
  const doc = frame.contentDocument;
  const view = frame.contentWindow as (Window & typeof globalThis) | null;
  if (!doc || !view) throw new Error("This page is on another address, so the studio can't read it. Use a page on the studio's own address, like /p/<name>/<version>.");

  // An empty page to learn what each kind of element looks like with no styling at all.
  const empty = document.createElement("iframe");
  empty.style.cssText = "position:fixed;left:-99999px;top:0;width:390px;height:844px;border:0";
  document.body.appendChild(empty);
  try {
    const bare = empty.contentDocument!;
    const cache = new Map<string, CSSStyleDeclaration>();
    const baseline = (tag: string, svg: boolean) => {
      const key = `${svg ? "svg:" : ""}${tag}`;
      let style = cache.get(key);
      if (!style) {
        const element = svg ? bare.createElementNS(SVG, tag) : bare.createElement(tag);
        bare.body.appendChild(element);
        style = empty.contentWindow!.getComputedStyle(element);
        cache.set(key, style);
      }
      return style;
    };
    const context: Context = { view, baseline, nodes: 0, truncated: false, index: [], flags: [] };
    const body = doc.body;
    const html = serialize(body, context);
    const width = Math.ceil(doc.documentElement.scrollWidth);
    const height = Math.ceil(doc.documentElement.scrollHeight);
    const background = view.getComputedStyle(doc.documentElement).backgroundColor;
    const fonts = fontRules(doc);
    const geometry = geometryOf(doc, context, options.components ?? null);
    const made: Snapshot = { html, fonts, geometry, tokens: tokensOf(doc), width, height, background: background === "rgba(0, 0, 0, 0)" ? view.getComputedStyle(body).backgroundColor : background, nodes: context.nodes, truncated: context.truncated, ms: performance.now() - started };
    if (options.check) made.check = await verify(doc, html, fonts, context.index, frame.clientWidth || 390);
    return made;
  } finally {
    empty.remove();
  }
}

/** Loads `src` in a hidden frame of a screen's size, lets it settle, and reads it. */
export async function captureFrom(src: string, size: { width: number; height: number }, options: { check?: boolean } = {}): Promise<Snapshot> {
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-99999px;top:0;width:${size.width}px;height:${size.height}px;border:0`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("The page didn't load in 20 seconds.")), 20000);
      frame.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      frame.src = src;
    });
    // Hydration, fonts and the page's own entrance animations: the same wait the canvas gives a page before it counts as ready.
    await frame.contentDocument?.fonts?.ready;
    await new Promise((done) => setTimeout(done, 1500));
    return await snapshotOf(frame, options);
  } finally {
    frame.remove();
  }
}
