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

export function setPicture(element: Element, src: string) {
  if (element.tagName === "IMG") {
    element.removeAttribute("srcset");
    element.setAttribute("src", src);
  } else {
    (element as HTMLElement).style.setProperty("background-image", `url("${src}")`, "important");
  }
}

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
