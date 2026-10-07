/**
 * Dev mode: reads a prototype's own document so an engineer can pick a part
 * of it and take its front-end code, and watch what moves.
 *
 * Nothing is written to the prototype except one highlight box while it is on.
 * What comes back is what is really on screen: the markup with its Tailwind
 * classes, the computed styles, and the component's name when React still
 * knows it. Works because the studio serves prototypes from its own origin.
 */

const OVERLAY_ID = "studio-inspect";

export type Picked = {
  tag: string;
  /** The React component that rendered it, when its name survived the build. */
  component?: string;
  classes: string[];
  /** Indented markup for this element and everything inside it. */
  html: string;
  width: number;
  height: number;
  styles: { label: string; value: string; color?: string }[];
};

export type MotionSeen = {
  id: string;
  /** What moved: an animation's name, or the property a transition changed. */
  what: string;
  kind: "animation" | "transition";
  duration: string;
  easing: string;
  delay?: string;
  /** The element it happened on, as a short tag.class. */
  on: string;
};

type Handlers = {
  onPick: (picked: Picked, element: Element) => void;
  onMotion: (seen: MotionSeen) => void;
  /** A double-click on a part, while picking. */
  onEdit?: (element: Element) => void;
  /** Any key pressed in the prototype, except while typing into text. */
  onKey?: (event: KeyboardEvent) => void;
};

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SKIP = new Set(["script", "style", "noscript"]);

/** `instanceof Element` is false for a node from the prototype's own window, so ask the node. */
const isElement = (node: unknown): node is Element => (node as Node | null)?.nodeType === Node.ELEMENT_NODE;

/** Markup the way a person would write it: one tag per line, indented, no studio or script noise. */
function format(node: Node, depth = 0): string {
  const pad = "  ".repeat(depth);
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    return text ? `${pad}${text}\n` : "";
  }
  if (!isElement(node)) return "";
  const tag = node.tagName.toLowerCase();
  if (SKIP.has(tag) || node.id === OVERLAY_ID) return "";

  const attributes = [...node.attributes]
    .filter((a) => !a.name.startsWith("data-studio") && !a.name.startsWith("data-react") && !a.name.startsWith("data-nextjs"))
    .map((a) => (a.value === "" ? a.name : `${a.name}="${a.value.length > 160 ? `${a.value.slice(0, 160)}…` : a.value}"`))
    .join(" ");
  const open = `<${tag}${attributes ? ` ${attributes}` : ""}>`;
  if (VOID.has(tag)) return `${pad}${open}\n`;

  const inside = [...node.childNodes].map((child) => format(child, depth + 1)).join("");
  // A tag holding one short line of text stays on one line.
  const lines = inside.trimEnd().split("\n");
  if (lines.length === 1 && lines[0] && !lines[0].trimStart().startsWith("<")) {
    return `${pad}${open}${lines[0].trim()}</${tag}>\n`;
  }
  return `${pad}${open}\n${inside}${pad}</${tag}>\n`;
}

/** The name of the React component that rendered this element, if the build kept it. */
function componentName(element: Element) {
  const key = Object.keys(element).find((k) => k.startsWith("__reactFiber$"));
  let fiber = key ? ((element as unknown as Record<string, unknown>)[key] as { type?: unknown; return?: unknown } | null) : null;
  while (fiber) {
    const type = fiber.type as { displayName?: string; name?: string; render?: { name?: string } } | string | undefined;
    if (type && typeof type !== "string") {
      const name = type.displayName || type.name || type.render?.name;
      // A minified build names everything "a" or "tQ"; that is no help to anyone.
      if (name && name.length > 2) return name;
    }
    fiber = fiber.return as typeof fiber;
  }
  return undefined;
}

const nonZero = (value: string) => value.split(" ").some((part) => parseFloat(part) !== 0);

function describe(element: Element): Picked {
  const view = element.ownerDocument.defaultView!;
  const css = view.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const styles: Picked["styles"] = [];
  const add = (label: string, value: string, color?: string) => styles.push({ label, value, color });

  const hasText = [...element.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
  if (hasText) {
    add("Type", `${css.fontSize} / ${css.fontWeight}${css.lineHeight !== "normal" ? ` · line ${css.lineHeight}` : ""}`);
    add("Colour", css.color, css.color);
  }
  if (css.backgroundColor !== "rgba(0, 0, 0, 0)") add("Background", css.backgroundColor, css.backgroundColor);
  if (nonZero(css.padding)) add("Padding", css.padding);
  if (nonZero(css.margin)) add("Margin", css.margin);
  if (css.display.includes("flex") || css.display.includes("grid")) {
    add("Layout", `${css.display}${css.gap !== "normal" && nonZero(css.gap) ? ` · gap ${css.gap}` : ""}`);
  }
  if (nonZero(css.borderRadius)) add("Radius", css.borderRadius);
  if (css.boxShadow !== "none") add("Shadow", css.boxShadow);

  return {
    tag: element.tagName.toLowerCase(),
    component: componentName(element),
    classes: [...element.classList],
    html: format(element).trimEnd(),
    width: Math.round(box.width),
    height: Math.round(box.height),
    styles,
  };
}

/** A short handle for an element in the motion list: `button.rounded-full`. */
function handle(element: Element) {
  const first = element.classList[0];
  return `${element.tagName.toLowerCase()}${first ? `.${first}` : ""}`;
}

/**
 * Switches dev mode on in a prototype's document. While `picking`, hovering
 * outlines a part and clicking takes it, so the prototype itself can't be
 * used; with it off the prototype works as normal and motion is still
 * recorded. Returns the undo.
 */
export function inspectDocument(doc: Document, picking: boolean, handlers: Handlers) {
  const view = doc.defaultView;
  if (!view || !doc.body) return () => {};

  // The highlight box. It never takes a click.
  const tokens = getComputedStyle(document.documentElement);
  const line = tokens.getPropertyValue("--focus-ring").trim() || "currentColor";
  const box = doc.createElement("div");
  box.id = OVERLAY_ID;
  box.style.cssText = `position:fixed;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box;border:2px solid ${line};background:color-mix(in srgb, ${line} 8%, transparent);`;
  doc.body.appendChild(box);

  const target = (event: Event) => {
    const element = event.target;
    return isElement(element) && element !== doc.documentElement && element !== doc.body && element.id !== OVERLAY_ID ? element : null;
  };

  const hover = (event: Event) => {
    const element = target(event);
    if (!element) {
      box.style.display = "none";
      return;
    }
    const rect = element.getBoundingClientRect();
    Object.assign(box.style, { display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };
  const leave = () => {
    box.style.display = "none";
  };
  const pick = (event: Event) => {
    const element = target(event);
    // Text being typed into takes its clicks, so the caret can be placed.
    if (!element || (element as HTMLElement).isContentEditable) return;
    event.preventDefault();
    event.stopPropagation();
    handlers.onPick(describe(element), element);
  };

  const edit = (event: Event) => {
    const element = target(event);
    if (!element || (element as HTMLElement).isContentEditable) return;
    event.preventDefault();
    handlers.onEdit?.(element);
  };

  const keys = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement | null)?.isContentEditable) return;
    handlers.onKey?.(event);
  };
  doc.addEventListener("keydown", keys, true);

  if (picking) {
    doc.addEventListener("dblclick", edit, true);
    doc.addEventListener("mouseover", hover, true);
    doc.addEventListener("mouseleave", leave);
    doc.addEventListener("click", pick, true);
  }

  // What moves, whether or not an element is being picked.
  let count = 0;
  const motion = (kind: MotionSeen["kind"]) => (event: Event) => {
    const element = event.target;
    if (!isElement(element) || element.id === OVERLAY_ID) return;
    const css = view.getComputedStyle(element);
    const what = kind === "animation" ? (event as AnimationEvent).animationName : (event as TransitionEvent).propertyName;
    // Transitions list every property together; pair this one with its own duration and easing.
    const names = css.transitionProperty.split(", ");
    const at = Math.max(0, names.indexOf(what));
    const nth = (list: string) => {
      const parts = list.split(/,(?![^(]*\))\s*/);
      return parts[kind === "animation" ? 0 : at] ?? parts[0];
    };
    const delay = nth(kind === "animation" ? css.animationDelay : css.transitionDelay);
    handlers.onMotion({
      id: `${kind}:${what}:${handle(element)}:${count++}`,
      what,
      kind,
      duration: nth(kind === "animation" ? css.animationDuration : css.transitionDuration),
      easing: nth(kind === "animation" ? css.animationTimingFunction : css.transitionTimingFunction),
      delay: delay === "0s" ? undefined : delay,
      on: handle(element),
    });
  };
  const animated = motion("animation");
  const transitioned = motion("transition");
  doc.addEventListener("animationstart", animated, true);
  doc.addEventListener("transitionrun", transitioned, true);

  return () => {
    doc.removeEventListener("keydown", keys, true);
    doc.removeEventListener("dblclick", edit, true);
    doc.removeEventListener("mouseover", hover, true);
    doc.removeEventListener("mouseleave", leave);
    doc.removeEventListener("click", pick, true);
    doc.removeEventListener("animationstart", animated, true);
    doc.removeEventListener("transitionrun", transitioned, true);
    box.remove();
  };
}
