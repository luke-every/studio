/**
 * An element as the page draws it now, written as JSX that stands on its own: the tags, their classes, their inline styles, their words and pictures, and nothing
 * from the code around it (no state, no props, no handlers). This is the last resort when an element is taken out of a page whose code uses values only the code around it
 * has: what is on the page is still there to copy, so the copy is of that. A static snapshot: nothing in it runs, and what a page adds with `::before` is not in it.
 *
 * Works on a document of any kind (the studio's own frame, a copy's shadow root, a live page in its own window), so it uses no `instanceof`.
 */
const SKIP = new Set(["script", "style", "link", "meta", "noscript", "template", "head", "title", "iframe", "object", "embed", "canvas", "audio", "video"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const BOOLEAN = new Set(["disabled", "checked", "selected", "required", "readonly", "open", "hidden", "multiple", "autoplay", "controls", "loop", "muted", "playsinline", "autofocus", "novalidate"]);
const RENAMED: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  maxlength: "maxLength",
  minlength: "minLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  autocomplete: "autoComplete",
  autofocus: "autoFocus",
  contenteditable: "contentEditable",
  crossorigin: "crossOrigin",
  srcset: "srcSet",
  fetchpriority: "fetchPriority",
  playsinline: "playsInline",
  novalidate: "noValidate",
  "xlink:href": "href",
  value: "defaultValue",
  checked: "defaultChecked",
};
/** Attributes React types as a number: a string is a type error in the file the snapshot becomes (`tabIndex="-1"`), so they are written as one (`tabIndex={-1}`). */
const NUMERIC = new Set(["tabIndex", "colSpan", "rowSpan", "maxLength", "minLength", "cols", "rows", "span", "size", "start", "low", "high", "optimum"]);
/** The most elements a snapshot holds: a page's whole body would not be a useful thing to copy out. */
const MOST = 1500;
/** The invisible mark the page puts on each line of its copy (see `edit-dom.ts`): not part of the words. */
const MARK = /\u2060[\u200c\u200d]{16}\u2060/g;

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
const quoted = (value: string) => (/["\\{}\n\r]/.test(value) ? `{${JSON.stringify(value)}}` : `"${value}"`);

/** A style attribute as the object React wants: custom properties keep their names, the rest are written in camel case. */
function styleOf(element: Element) {
  const style = (element as HTMLElement).style;
  if (!style?.length) return "";
  const entries: string[] = [];
  for (let at = 0; at < style.length; at++) {
    const name = style[at];
    const value = style.getPropertyValue(name);
    if (!value) continue;
    const key = name.startsWith("--") ? JSON.stringify(name) : name.startsWith("-ms-") ? camel(name.slice(1)) : camel(name.startsWith("-") ? name.slice(1).replace(/^./, (c) => c.toUpperCase()) : name);
    entries.push(`${/^[A-Za-z_]\w*$/.test(key) ? key : JSON.stringify(key)}: ${JSON.stringify(value)}`);
  }
  return entries.length ? `{{ ${entries.join(", ")} }}` : "";
}

function attributesOf(element: Element, svg: boolean) {
  const out: string[] = [];
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name;
    const lower = name.toLowerCase();
    if (lower === "style" || lower.startsWith("on") || lower.startsWith("data-studio") || lower === "data-ix" || lower.startsWith("data-next") || lower === "nonce" || lower === "integrity" || lower === "xml:space") continue;
    // The element's own value is what is drawn, not the one it began with.
    if ((lower === "value" || lower === "checked") && !["input", "textarea", "select", "option"].includes(element.localName)) continue;
    const key = RENAMED[lower] ?? (lower.startsWith("aria-") || lower.startsWith("data-") ? lower : svg ? camel(name) : lower);
    if (BOOLEAN.has(lower) && (attribute.value === "" || attribute.value === lower)) out.push(RENAMED[lower] ?? key);
    else if (NUMERIC.has(key) && /^-?\d+(\.\d+)?$/.test(attribute.value.trim())) out.push(`${key}={${Number(attribute.value)}}`);
    else out.push(`${key}=${quoted(attribute.value.replace(MARK, ""))}`);
  }
  const style = styleOf(element);
  if (style) out.push(`style=${style}`);
  return out;
}

const hidden = (element: Element) => {
  try {
    const view = element.ownerDocument.defaultView;
    return !!view && view.getComputedStyle(element).display === "none";
  } catch {
    return false;
  }
};

/** The element as JSX, or null when there is nothing drawn to take. */
export function jsxOf(root: Element): string | null {
  let count = 0;
  const write = (node: Node, depth: number, svgParent: boolean): string[] => {
    const pad = "  ".repeat(depth);
    if (node.nodeType === 3) {
      const text = (node.nodeValue ?? "").replace(MARK, "");
      if (!text.trim()) return node.previousSibling && node.nextSibling && !/[\n\r]/.test(text) ? [`${pad}{" "}`] : [];
      const squeezed = text.replace(/\s+/g, " ");
      return [/^[^{}<>&"'\\\s]+(?: [^{}<>&"'\\\s]+)*$/.test(squeezed) ? `${pad}${squeezed}` : `${pad}{${JSON.stringify(squeezed)}}`];
    }
    if (node.nodeType !== 1) return [];
    const element = node as Element;
    const tag = element.localName;
    if (SKIP.has(tag) || (tag.includes("-") && (element as HTMLElement).shadowRoot) || hidden(element)) return [];
    // Past that, the rest is left out (it would be a second root, which a component can't return): what is held is whole elements, down to the limit.
    if (++count > MOST) return [];
    const svg = svgParent || tag === "svg";
    const attributes = attributesOf(element, svg);
    const open = `${pad}<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}`;
    if (VOID.has(tag)) return [`${open} />`];
    const children = Array.from(element.childNodes).flatMap((child) => write(child, depth + 1, svg));
    if (!children.length) return [`${open} />`];
    return [`${open}>`, ...children, `${pad}</${tag}>`];
  };
  const lines = write(root, 0, root.namespaceURI === "http://www.w3.org/2000/svg");
  return lines.length ? lines.join("\n") : null;
}
