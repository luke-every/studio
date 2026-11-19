/**
 * Where a section of a prototype's copy sits in its page, found by the words: the box that holds the few lines a link to the section carries (see
 * `Group.find` in `copy-doc-build.ts`). It reads the text as the page shows it, so a built version, whose copy carries no marks, answers the same as
 * a running one. A line that is found in two places is left out (it could be either), and one that isn't found at all is too; null when none is.
 */
export type Box = { left: number; top: number; width: number; height: number };

const plain = (text: string) => text.replace(/[⁠‌‍]/g, "").replace(/\s+/g, " ").trim();

export function boxOfTexts(doc: Document, finds: string[]): Box | null {
  if (!doc.body) return null;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: { node: Text; text: string }[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) continue;
    const text = plain(node.textContent ?? "");
    if (text) nodes.push({ node: node as Text, text });
  }
  const view = doc.defaultView;
  let box: { left: number; top: number; right: number; bottom: number } | null = null;
  for (const find of finds) {
    const wanted = plain(find);
    const hits = nodes.filter((one) => one.text.includes(wanted));
    if (hits.length !== 1) continue;
    const range = doc.createRange();
    range.selectNodeContents(hits[0].node);
    const rect = range.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const left = rect.left + (view?.scrollX ?? 0);
    const top = rect.top + (view?.scrollY ?? 0);
    box = box
      ? { left: Math.min(box.left, left), top: Math.min(box.top, top), right: Math.max(box.right, left + rect.width), bottom: Math.max(box.bottom, top + rect.height) }
      : { left, top, right: left + rect.width, bottom: top + rect.height };
  }
  return box ? { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top } : null;
}
