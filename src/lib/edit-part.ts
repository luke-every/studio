import { jsxOf } from "@/lib/jsx-snapshot";
import { copyIn, copyOf, drawnScale, imageIdIn, pictureOf, pictureSrcOf, selectorFor, setPicture, sizeProperties, sizingOf, textOf, toHex, unmark, writeText, type Axis, type Sizing } from "@/lib/edit-dom";
import { nameOfType, plainOf } from "@/lib/capture-props";
import { boxOfElement, elementAt, rootOf, type Box, type Reach } from "@/lib/anchor";
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
  "align-items", "align-self", "backdrop-filter", "background-color", "background-image", "border-bottom-left-radius", "border-bottom-right-radius",
  "border-top-color", "border-top-left-radius", "border-top-right-radius", "border-top-style", "border-top-width", "bottom",
  "box-shadow", "color", "column-gap", "display", "filter", "flex-direction", "flex-grow", "flex-wrap", "font-family", "font-size",
  "font-style", "font-weight", "height", "justify-content", "left", "letter-spacing", "line-height", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "mix-blend-mode", "opacity", "overflow-x", "padding-bottom", "padding-left", "padding-right", "padding-top", "position",
  "right", "row-gap", "text-align", "text-decoration-line", "text-transform", "top", "visibility", "width", "z-index",
];

const AXES: Axis[] = ["width", "height"];
const SIZINGS: Sizing[] = ["fixed", "fill", "hug"];

/** A design token of the page: its name, what to set to use it (`var(--color-dark)`), and its value (a `#rrggbb` for a colour, pixels for a size). */
export type Token = { name: string; css: string; value: string };
export type Tokens = { colours: Token[]; radii: Token[]; spacing: Token[] };

/** Tailwind's own scale, used for what a page doesn't define itself. Steps are multiples of the spacing unit. */
const SPACING_STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64];
const RADII = [["sm", 4], ["md", 6], ["lg", 8], ["xl", 12], ["2xl", 16], ["3xl", 24], ["full", 9999]] as const;

const tokenCache = new WeakMap<Document, { sheets: number; tokens: Tokens }>();

/** The custom properties a page's stylesheets set on its root, by name. */
function rootProperties(doc: Document) {
  const names = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      const { selectorText, style } = rule as CSSStyleRule;
      if (style && /:root|:host|^html\b/.test(selectorText ?? "")) for (const name of style) if (name.startsWith("--")) names.add(name);
      const inner = (rule as CSSGroupingRule).cssRules;
      if (inner) walk(inner);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // A sheet from another address can't be read.
    }
  }
  return [...names];
}

/**
 * The page's own design tokens, so the panel offers what the design system has and not whatever a number can be: its
 * colours (`--color-*`), radii (`--radius-*`) and spacing (`--spacing`, a unit the scale is multiples of), read from its stylesheets and
 * resolved to values. Where a page defines no radii or spacing, Tailwind's scale stands in, as plain pixels.
 */
export function tokensOf(doc: Document): Tokens {
  const cached = tokenCache.get(doc);
  if (cached && cached.sheets === doc.styleSheets.length) return cached.tokens;
  const win = doc.defaultView!;
  const names = rootProperties(doc);
  const tokens: Tokens = { colours: [], radii: [], spacing: [] };
  if (!doc.body) return tokens;
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  doc.body.appendChild(probe);
  const resolve = (property: "color" | "borderTopLeftRadius" | "width", value: string) => {
    probe.style[property] = "";
    probe.style[property] = value;
    return win.getComputedStyle(probe)[property];
  };
  const canvas = doc.createElement("canvas").getContext("2d");
  const hexOf = (css: string) => {
    if (!canvas) return toHex(css);
    canvas.fillStyle = "#000000";
    canvas.fillStyle = css;
    return canvas.fillStyle.startsWith("#") ? canvas.fillStyle : toHex(canvas.fillStyle);
  };
  try {
    for (const name of names) {
      // A reset (`--color-*: initial`) isn't a token.
      const colour = name.match(/^--color-([^*]+)$/);
      const radius = name.match(/^--radius-([^*]+)$/);
      if (colour) {
        tokens.colours.push({ name: colour[1], css: `var(${name})`, value: hexOf(resolve("color", `var(${name})`)) });
      } else if (radius) {
        const px = parseFloat(resolve("borderTopLeftRadius", `var(${name})`));
        if (px >= 0) tokens.radii.push({ name: radius[1], css: `var(${name})`, value: String(px) });
      }
    }
    const hasUnit = names.includes("--spacing");
    const unit = hasUnit ? parseFloat(resolve("width", "var(--spacing)")) || 4 : 4;
    tokens.spacing = SPACING_STEPS.map((step) => ({ name: String(step), css: hasUnit ? `calc(var(--spacing) * ${step})` : `${step * unit}px`, value: String(step * unit) }));
  } finally {
    probe.remove();
  }
  if (!tokens.radii.length) tokens.radii = RADII.map(([name, px]) => ({ name, css: `${px}px`, value: String(px) }));
  tokens.radii.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));
  tokenCache.set(doc, { sheets: doc.styleSheets.length, tokens });
  return tokens;
}

/** One piece of text of its own in an element that has other elements among its words: where it is among the element's children, its words, which line of the copy file they are, and where it is drawn. */
export type Segment = { index: number; text: string; copy: number | null; box: { left: number; top: number; width: number; height: number }; rects: { left: number; top: number; width: number; height: number }[] };

/** The pieces of text of an element that has other elements among its words; none when its words are plain. */
function segmentsOf(element: Element, place: (r: DOMRect) => Box): Segment[] | undefined {
  if (textOf(element) !== null) return undefined;
  const found: Segment[] = [];
  element.childNodes.forEach((node, index) => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const raw = node.textContent ?? "";
    const text = unmark(raw);
    if (!text.trim()) return;
    const range = element.ownerDocument.createRange();
    range.selectNodeContents(node);
    const plain = place;
    const rects = [...range.getClientRects()].filter((r) => r.width && r.height).slice(0, 8).map(plain);
    if (rects.length) found.push({ index, text, copy: copyIn(raw), box: plain(range.getBoundingClientRect()), rects });
  });
  return found.length ? found : undefined;
}

/**
 * The part to type over at a point (in the page's pixels): the part itself when its words are plain, or, when other
 * elements are among them, the piece of text under the point, as a part of its own. Null when there are no words there.
 */
export function editable(part: Part | null, x: number, y: number): Part | null {
  if (!part) return null;
  if (part.text !== null) return part;
  const piece = part.segments?.find((seg) => seg.rects.some((r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height));
  return piece ? { ...part, text: piece.text, copy: piece.copy, box: piece.box, node: piece.index, segments: undefined } : null;
}

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
  /** Which line of the prototype's copy file the words are, when they are one (see `copyOf`). */
  copy: number | null;
  /** When other elements are among its words (a heading with an italic bit), each piece of text of its own, to be changed on its own. */
  segments?: Segment[];
  /** Set on a part made from one of those pieces (see `editable`): the piece, so an edit is to it and not to the whole. */
  node?: number;
  hasText: boolean;
  /** What is behind its words: the first background colour that isn't clear, from the part outwards. */
  backdrop: string;
  /** The element whose picture a swap here would change (see `pictureOf`), by selector. */
  picture: string | null;
  /** What that picture is: an <img> (`img`), or a background image (`fill`). And the address it shows now, to preview it. */
  pictureKind: "img" | "fill" | null;
  pictureSrc: string | null;
  /** Which line of the prototype's copy file that picture's address is, when it is one (see `imageIdIn`). */
  pictureCopy: number | null;
  sizing: Record<Axis, Sizing>;
  /** The properties each sizing along each axis would set (see `sizeProperties`). */
  sizes: Record<Axis, Record<Sizing, [string, string][]>>;
  /** The page's design tokens, which colours, radii and spacing are chosen from. */
  tokens: Tokens;
  /** Where it is in its page's window, in the page's own pixels. */
  box: { left: number; top: number; width: number; height: number };
  /** Where this element is written in a fork's file (file:line:column), when the page was built to say so (`data-studio-loc`). */
  loc?: string;
  /** Its classes as the code has them: what an engineer copies. */
  classes?: string;
  /** When this element is the top of a component the page uses: where the page uses it (file:line:column of that tag). */
  usedAt?: string;
  /** Set when it is an element inside a design-system component (a live version), not the component itself: the component's name. Its look is the component's, so only its words can be changed. */
  inside?: string;
  /** Set when it is the root of a design-system component instance (a live version): what it is, and its props that are plain values. */
  component?: { name: string; props: Record<string, string | number | boolean>; preview: boolean };
};

type Fiber = { type?: unknown; return?: Fiber | null; child?: Fiber | null; sibling?: Fiber | null; stateNode?: unknown; memoizedProps?: Record<string, unknown>; _debugOwner?: Fiber | null };

const fiberOf = (element: Element) => {
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
  return key ? ((element as unknown as Record<string, Fiber | null>)[key] ?? null) : null;
};
/**
 * Where the page uses the component this element is the top of: the outermost component whose first element it is, by where its tag is written. The tag's place
 * (`data-studio-loc`, put on it while the page is built) reaches the component as a prop, so it can be read there. With two uses of one component, it says which.
 * Elements that are each the only one inside the next (a section holding one wrapper holding the content) are one thing to look at: the top of any of them is the component.
 */
const usedAtOf = (element: Element): string | undefined => {
  const chain = new Set<Element>([element]);
  for (let up = element.parentElement; up && up.children.length === 1; up = up.parentElement) chain.add(up);
  let found: string | undefined;
  for (let fiber = fiberOf(element); fiber; fiber = fiber.return ?? null) {
    if (typeof fiber.type === "string" || !fiber.type) continue;
    const loc = fiber.memoizedProps?.["data-studio-loc"];
    const host = typeof loc === "string" ? hostOf(fiber) : null;
    if (host && chain.has(host)) found = loc as string;
  }
  return found;
};
/**
 * What a copy of an element needs to be drawn somewhere else as it is on this page now (`capture-props.ts`): the component it is the top of, if it is (a
 * section's own element, or the elements that are each the only one in the next, down from it) with what that was given and where the page uses it; and the
 * components that drew it, nearest first, each with what it was given. A page in production has no owners to read, so it says nothing.
 */
export type Capture = { top: { name: string; props: unknown; usedAt?: string } | null; owners: { name: string; props: unknown }[]; /** The element as the page draws it now, as JSX that stands on its own (see `jsxOf`): what is taken when its code can't be, because it uses values only the code around it has. */ markup?: string };

export function captureOf(element: Element): Capture {
  const chain = new Set<Element>([element]);
  for (let up = element.parentElement; up && up.children.length === 1; up = up.parentElement) chain.add(up);
  let top: Capture["top"] = null;
  for (let fiber = fiberOf(element); fiber; fiber = fiber.return ?? null) {
    if (typeof fiber.type === "string" || !fiber.type) continue;
    const name = nameOfType(fiber.type);
    const host = name && /^[A-Z]/.test(name) ? hostOf(fiber) : null;
    // A component that draws more than this element (a provider around the whole page, say) is not what this element is the top of.
    if (name && host && chain.has(host) && !drawsMoreThan(fiber, host)) {
      const loc = fiber.memoizedProps?.["data-studio-loc"];
      top = { name, props: plainOf(fiber.memoizedProps), ...(typeof loc === "string" ? { usedAt: loc } : {}) };
    }
  }
  const owners: Capture["owners"] = [];
  for (let owner = fiberOf(element)?._debugOwner ?? null; owner && owners.length < 6; owner = owner._debugOwner ?? null) {
    const name = nameOfType(owner.type);
    if (name && /^[A-Z]/.test(name)) owners.push({ name, props: plainOf(owner.memoizedProps) });
  }
  return { top, owners, markup: jsxOf(element) ?? undefined };
}

const nameOf = (fiber: Fiber) => {
  const type = fiber.type as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | string | undefined;
  return type && typeof type !== "string" ? type.displayName || type.name || type.render?.name || type.type?.name || "" : "";
};
/** Whether the component draws an element besides `host` (its own host elements, found down through what it renders). */
const drawsMoreThan = (fiber: Fiber, host: Element): boolean => {
  const walk = (from: Fiber | null | undefined): boolean => {
    for (let at = from; at; at = at.sibling) {
      const node = at.stateNode as Element | null | undefined;
      if (typeof at.type === "string" && node?.nodeType === 1) {
        if (node !== host) return true;
      } else if (walk(at.child)) return true;
    }
    return false;
  };
  return walk(fiber.child);
};
const hostOf = (fiber: Fiber | null | undefined): Element | null => {
  for (let at = fiber?.child; at; at = at.sibling) {
    // Not `instanceof`: a page in a frame has its own `Element`, which the studio's is not.
    const node = at.stateNode as Element | null | undefined;
    const found = typeof at.type === "string" && node?.nodeType === 1 ? node : hostOf(at);
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
/** The files of a project's forks, as an element's mark (`data-studio-loc`) names them. */
const FORK_FILES = "src/components/forks/";
const outsideForks = (element: Element) => {
  const loc = element.getAttribute("data-studio-loc");
  return loc !== null && !loc.startsWith(FORK_FILES);
};

/**
 * A fork's page draws the fork's own files and, inside them, the other components it uses, which are the originals, shared with the rest of the prototype. An element
 * written in a file that is not the fork's belongs to one of those: this is the top of it (the elements up from it that are of the same kind), or null.
 */
function nestedOriginal(element: Element): Element | null {
  if (element.ownerDocument.location?.pathname !== "/studio-stage" || !outsideForks(element)) return null;
  let root = element;
  for (let up = element.parentElement; up && outsideForks(up); up = up.parentElement) root = up;
  return root;
}

export function componentOf(element: Element, names: Set<string>) {
  // A page that says what it drew: the studio's stage marks its component (`data-studio-component`, with its plain props as JSON), which works in a production
  // build, where there are no owners to read. The component's root is what the mark holds; everything in it is inside it.
  const marked = element.closest("[data-studio-component]");
  if (marked?.firstElementChild) {
    let props: Record<string, string | number | boolean> = {};
    try {
      props = JSON.parse(marked.getAttribute("data-studio-props") ?? "{}") as typeof props;
    } catch {
      // Props that don't parse are none.
    }
    return { root: marked.firstElementChild, name: marked.getAttribute("data-studio-component") ?? "", props, fiber: null as Fiber | null };
  }
  // On a fork's page, a component the fork uses but doesn't own is a component here, whole: not the fork's to change, as the design system's are not.
  const nested = nestedOriginal(element);
  if (nested) {
    const owner = fiberOf(nested)?._debugOwner ?? null;
    const props: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(owner?.memoizedProps ?? {})) {
      if ((key !== "children" || typeof value === "string") && ["string", "number", "boolean"].includes(typeof value)) props[key] = value as string | number | boolean;
    }
    return { root: nested, name: (owner && nameOf(owner)) || nested.tagName.toLowerCase(), props, fiber: owner as Fiber | null };
  }
  // Without names there is nothing to look for in the owners.
  if (!names.size) return null;
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
      if (!originals.has(key)) originals.set(key, { element, prop: edit.prop, value: found.fiber?.memoizedProps?.[edit.prop], names });
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

/** `names` are the design system's components: the root of one is described as that component instance; an element inside one is itself, marked as inside it. */
export function describePart(picked: Element, names?: string[], copyTokens?: Tokens): Part {
  const found = componentOf(picked, new Set(names ?? []));
  const inside = found && found.root !== picked ? found.name : undefined;
  const whole = inside ? null : found;
  const element = picked;
  const computed = element.ownerDocument.defaultView!.getComputedStyle(element);
  const css = Object.fromEntries(PROPERTIES.map((property) => [property, computed.getPropertyValue(property).trim()]));
  const parent = element.parentElement;
  const picture = pictureOf(element);
  const rect = element.getBoundingClientRect();
  // On a static copy (in a scaled shadow root) the page's own pixels are the copy's less its place and scale.
  const k = drawnScale(element);
  const home = element.getRootNode();
  const origin = home instanceof ShadowRoot ? home.host.getBoundingClientRect() : { left: 0, top: 0 };
  const place = (r: DOMRect) => ({ left: (r.left - origin.left) / k, top: (r.top - origin.top) / k, width: r.width / k, height: r.height / k });
  let backdrop = "rgb(255, 255, 255)";
  for (let up: Element | null = element; up; up = up.parentElement) {
    const colour = element.ownerDocument.defaultView!.getComputedStyle(up).backgroundColor;
    if (colour && !/^rgba\(.*, 0\)$|^transparent$/.test(colour)) {
      backdrop = colour;
      break;
    }
  }
  const each = <T,>(make: (axis: Axis) => T) => Object.fromEntries(AXES.map((axis) => [axis, make(axis)])) as Record<Axis, T>;
  return {
    selector: selectorFor(element),
    tag: element.tagName.toLowerCase(),
    css,
    parentDisplay: parent ? element.ownerDocument.defaultView!.getComputedStyle(parent).display : "",
    text: textOf(element),
    copy: copyOf(element),
    segments: segmentsOf(element, place),
    hasText: [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()),
    backdrop,
    picture: picture ? selectorFor(picture) : null,
    pictureKind: picture ? (picture.tagName === "IMG" ? "img" : "fill") : null,
    pictureSrc: picture ? pictureSrcOf(picture) : null,
    pictureCopy: picture ? imageIdIn(pictureSrcOf(picture)) : null,
    sizing: each((axis) => sizingOf(element, axis)),
    sizes: each((axis) => Object.fromEntries(SIZINGS.map((mode) => [mode, sizeProperties(element, axis, mode, parseFloat(css[axis]) || 0)])) as Record<Sizing, [string, string][]>),
    tokens: copyTokens ?? tokensOf(element.ownerDocument),
    box: place(rect),
    inside,
    loc: element.getAttribute("data-studio-loc") ?? undefined,
    classes: element.getAttribute("class")?.trim() || undefined,
    usedAt: usedAtOf(element),
    component: whole ? { name: whole.name, props: whole.props, preview: !!rendererOf() } : undefined,
  };
}

/** One face of a font a page draws its words in, with the file itself, so the studio can draw the same words the same way. Plain data, so it can be sent from a page on another address. */
export type Face = { family: string; weight: string; style: string; unicodeRange?: string; data: ArrayBuffer };

const MAX_FACES = 6;
const fetched = new WeakMap<Document, Map<string, Promise<ArrayBuffer | null>>>();

/** The names in a font-family list, without quotes. */
const familiesOf = (list: string) => (list.match(/("[^"]*"|'[^']*'|[^,])+/g) ?? []).map((name) => name.trim().replace(/^["']|["']$/g, ""));

/** The `@font-face` rules a document's stylesheets declare, with the address each is relative to. A sheet from another address can't be read. */
function faceRules(doc: Document) {
  const found: { rule: CSSStyleRule; base: string }[] = [];
  const walk = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      if (rule.constructor.name === "CSSFontFaceRule") found.push({ rule: rule as CSSStyleRule, base });
      else if ((rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules, base);
    }
  };
  for (const sheet of doc.styleSheets) {
    try {
      walk(sheet.cssRules, sheet.href ?? doc.baseURI);
    } catch {
      // A sheet from another address.
    }
  }
  return found;
}

/**
 * The faces of the fonts a part's words are set in (from its `font-family`, `font-weight` and `font-style`), read from
 * the page's own `@font-face` rules, with their files. The studio draws text over a prototype in its own page, which
 * has none of the prototype's fonts (a `next/font` family is named by a hash), so it is given these to draw it the same.
 */
export async function facesFor(doc: Document, css: Record<string, string>): Promise<Face[]> {
  const wanted = familiesOf(css["font-family"] ?? "");
  const weight = parseInt(css["font-weight"] ?? "") || 400;
  const italic = (css["font-style"] ?? "").startsWith("italic") || (css["font-style"] ?? "").startsWith("oblique");
  const cache = fetched.get(doc) ?? fetched.set(doc, new Map()).get(doc)!;
  const win = doc.defaultView!;

  const all = faceRules(doc).flatMap(({ rule, base }) => {
    const family = rule.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "");
    const url = rule.style.getPropertyValue("src").match(/url\(\s*["']?([^"')]+)["']?\s*\)/)?.[1];
    if (!wanted.includes(family) || !url) return [];
    const [low, high = low] = (rule.style.getPropertyValue("font-weight") || "400").split(/\s+/).map((n) => parseInt(n) || 400);
    const style = rule.style.getPropertyValue("font-style").trim() || "normal";
    return [{ family, low, high, style, unicodeRange: rule.style.getPropertyValue("unicode-range").trim() || undefined, url: new URL(url, base).href }];
  });
  // The weight and style the words are in; failing that, whatever the family has.
  const exact = all.filter((face) => weight >= face.low && weight <= face.high && (face.style.startsWith("italic") || face.style.startsWith("oblique")) === italic);
  const chosen = (exact.length ? exact : all).slice(0, MAX_FACES);

  const faces = await Promise.all(
    chosen.map(async (face): Promise<Face | null> => {
      const data = await (cache.get(face.url) ?? cache.set(face.url, win.fetch(face.url).then((response) => (response.ok ? response.arrayBuffer() : null), () => null)).get(face.url)!);
      return data ? { family: face.family, weight: face.low === face.high ? String(face.low) : `${face.low} ${face.high}`, style: face.style, unicodeRange: face.unicodeRange, data } : null;
    }),
  );
  return faces.flatMap((face) => (face ? [face] : []));
}

/**
 * Hides the words of the element a selector names (and anything inside it), keeping their room, while the studio types
 * over them. A style rule, not the element's own style, so words inside with a colour of their own are hidden too.
 * Returns the way to show them again.
 */
export function hideWords(doc: Document, selector: string) {
  const element = doc.head ? partIn(doc, selector) : null;
  if (!element) return () => {};
  const mark = "data-typing-over";
  element.setAttribute(mark, "");
  const style = doc.createElement("style");
  style.textContent = `[${mark}], [${mark}] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`;
  doc.head.appendChild(style);
  return () => {
    style.remove();
    element.removeAttribute(mark);
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

/** Where a selection reaches from: an element already selected (by selector), and whether to dive a level into it. */
export type From = { selector: string; into: boolean };

/**
 * What a point means to someone who has an element selected, as in Figma: that element while the point is inside it,
 * or, diving (`into`), the child of it that holds the point, one level down. Outside it, what is beside it: a sibling,
 * or the neighbour of the group it is in, whichever the point is in, at the same depth and one click away. Null when
 * it doesn't apply (the point is read as usual: the top-level group, or the one at the bottom with ⌘).
 */
export function reachFrom(doc: Document, hit: Element | null, from: From | undefined) {
  const selected = from && hit ? partIn(doc, from.selector) : null;
  if (!from || !hit || !selected) return null;
  if (selected.contains(hit)) {
    if (!from.into) return selected;
    // On the element itself (its own words, or a gap), there is nothing deeper there.
    if (hit === selected) return null;
    let child = hit;
    while (child.parentElement && child.parentElement !== selected) child = child.parentElement;
    return child === selected ? null : child;
  }
  if (from.into) return null;
  const root = rootOf(doc);
  for (let group = selected.parentElement; group && group !== doc.body && group !== doc.documentElement; group = group.parentElement) {
    if (!group.contains(hit)) continue;
    // In the gap between its children, the point is on the group itself: that is what is beside the selection.
    if (hit === group) return group === root || group.contains(root) ? null : group;
    let beside = hit;
    while (beside.parentElement && beside.parentElement !== group) beside = beside.parentElement;
    // At the page's own wrapper it is the top-level group, which a click picks anyway.
    return beside === root || beside.contains(root) ? null : beside;
  }
  return null;
}

/**
 * The box to outline under the pointer: what a click there would pick (see `reachFrom`), with its groups when asked.
 * In a design-system component, the component's root or what is inside it is a component's (`component`), so it is drawn as one.
 */
export function hoverBox(doc: Document, x: number, y: number, reach: Reach, names?: string[] | null): Box | null {
  const hit = elementAt(doc, x, y);
  const element = reachFrom(doc, hit, reach.from ? { selector: reach.from.selector, into: !!reach.from.into } : undefined) ?? (reach.deep !== false ? hit : elementAt(doc, x, y, false));
  if (!element) return null;
  const box = boxOfElement(element, reach.groups);
  return componentOf(element, new Set(names ?? [])) ? { ...box, component: true } : box;
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
          const piece = edit.node === undefined ? null : element.childNodes[edit.node];
          if (edit.node === undefined) writeText(element, edit.text);
          else if (piece?.nodeType === Node.TEXT_NODE) piece.textContent = edit.text;
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
