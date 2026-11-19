/**
 * Where a section of a prototype's copy sits in its page, found by the words: the box that holds the few lines a link to the section carries (see
 * `Group.find` in `copy-doc-build.ts`). It reads the text as the page shows it, so a built version, whose copy carries no marks, answers the same as
 * a running one. A line that is found in two places is left out (it could be either), and one that isn't found at all is too; null when none is.
 */
export type Box = { left: number; top: number; width: number; height: number };

const plain = (text: string) => text.replace(/[⁠‌‍]/g, "").replace(/\s+/g, " ").trim();

/** The text nodes under `root` that hold one of the lines, each line counted only when it is in exactly one node. */
export function uniqueTextNodes(doc: Document, root: Node, finds: string[]): Text[] {
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; text: string }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
    const text = plain(node.textContent ?? "");
    if (text) nodes.push({ node: node as Text, text });
  }
  const found: Text[] = [];
  for (const find of finds) {
    const wanted = plain(find);
    const hits = nodes.filter((one) => one.text.includes(wanted));
    if (hits.length === 1) found.push(hits[0].node);
  }
  return found;
}

/** The smallest box that holds them all; null when there are none. */
export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.left));
  const top = Math.min(...boxes.map((box) => box.top));
  const right = Math.max(...boxes.map((box) => box.left + box.width));
  const bottom = Math.max(...boxes.map((box) => box.top + box.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** In a live page's own document: the words' boxes, in the page's pixels. */
export function boxOfTexts(doc: Document, finds: string[]): Box | null {
  if (!doc.body) return null;
  const view = doc.defaultView;
  const boxes = uniqueTextNodes(doc, doc.body, finds).flatMap((node) => {
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    return rect.width && rect.height ? [{ left: rect.left + (view?.scrollX ?? 0), top: rect.top + (view?.scrollY ?? 0), width: rect.width, height: rect.height }] : [];
  });
  return unionBox(boxes);
}
