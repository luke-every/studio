/**
 * Visual edits: what somebody changed in a prototype from the studio, kept as
 * data beside the version rather than written into its files.
 *
 * An edit points at an element by a structural selector and says what it
 * should look like now. Saving makes a new version whose own copy of the files
 * is untouched; a small script in it, built from `edits.json`, applies the
 * edits when the prototype loads. `base` says which version they were made
 * on, so whoever (or whatever) continues the source can apply them there.
 */

import { showsFrom } from "@/lib/tailwind-classes";
import { z } from "zod";

/**
 * `page` is the page an edit belongs to, when it is one's own: an edit made on a fork (the project's own copy of a component) is drawn on that copy only, and an
 * edit made anywhere else never on it. The copy has the same elements as the component it is a copy of, so without this each would be drawn on the other.
 */
export type Edit = (
  /**
   * On a live version, `copy` is which line of its copy file the words are, and `was` the words as that line had them
   * (to check it is still that line): what saving writes the change to. Both are from before the first edit.
   */
  | { kind: "text"; selector: string; text: string; /** Of an element with other elements among its words, the one piece of text this is: which of its child nodes. */ node?: number; copy?: number; was?: string }
  /** `remove`: the element is taken out of the code, not only hidden; until that is written it is drawn hidden (`display: none`). */
  | { kind: "style"; selector: string; css: Record<string, string>; remove?: boolean; /** For a removal: the tag of the element, so that what is at the place in the file is checked to be it. */ expect?: string }
  /** `src` is a path inside the version's own folder. On a live version, `copy` is which line of its copy file the picture's address was, and saving writes the new picture there. */
  | { kind: "image"; selector: string; src: string; copy?: number }
  /** A prop of a design-system component instance, only ever made on a live version, where the page itself previews it. */
  | { kind: "prop"; selector: string; component: string; prop: string; value: string | number | boolean }
) & { page?: string; /** Where the element is written in a fork's file (file:line:column), put on it while the page is built. */ loc?: string; /** For a style: the width of the frame it was made on, which says whether it is for the desktop breakpoint (`lg:`), the middle one (`md:`) or for all. */ at?: number };

/** A named set of edits that is only shown when asked for, so the version itself stays as it was. */
export type EditVariant = { id: string; label: string; edits: Edit[] };

/** `edits` are always applied; each variant's are applied on top while it is the one asked for. */
export type EditsFile = { base: string; edits: Edit[]; variants?: EditVariant[] };

/** The address parameter that asks a prototype for one of its variants. */
export const VARIANT_PARAM = "studio-variant";

export const variantIdPattern = /^[a-z0-9-]{1,48}$/;

/** What the server accepts: these end up in a stylesheet and a script inside the prototype. */
export const editsSchema = z.array(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), selector: z.string().min(1), page: z.string().max(80).regex(/^[\w:.-]*$/).optional(), loc: z.string().max(300).optional(), text: z.string(), node: z.number().int().min(0).optional(), copy: z.number().int().min(0).optional(), was: z.string().optional() }),
    z.object({
      kind: z.literal("style"),
      selector: z.string().min(1),
      page: z.string().max(80).regex(/^[\w:.-]*$/).optional(),
      loc: z.string().max(300).optional(),
      at: z.number().int().min(0).max(20000).optional(),
      remove: z.literal(true).optional(),
      expect: z.string().regex(/^[a-z][a-z0-9-]*$/).max(40).optional(),
      css: z.record(z.string().regex(/^[a-z-]+$/), z.string().regex(/^[^{};<>]*$/)),
    }),
    z.object({ kind: z.literal("image"), selector: z.string().min(1), src: z.string().regex(/^_edits\/[\w.-]+$/), copy: z.number().int().min(0).optional() }),
    z.object({
      kind: z.literal("prop"),
      selector: z.string().min(1),
      component: z.string().regex(/^\w+$/),
      prop: z.string().regex(/^\w+$/),
      value: z.union([z.string().max(500), z.number(), z.boolean()]),
    }),
  ]),
);

/** Where replaced images are kept inside a version's folder. */
export const EDIT_IMAGE_DIR = "_edits";

/** Later edits win: the same property on the same element, the same text, the same image. */
export function mergeEdits(earlier: Edit[], later: Edit[]): Edit[] {
  const merged = [...earlier];
  for (const edit of later) {
    const at = merged.findIndex((other) => other.kind === edit.kind && other.selector === edit.selector && other.page === edit.page && showsFrom(other.at) === showsFrom(edit.at) && (edit.kind !== "prop" || (other as typeof edit).prop === edit.prop) && (edit.kind !== "text" || (other as typeof edit).node === edit.node));
    if (at === -1) merged.push(edit);
    else if (edit.kind === "style" && merged[at].kind === "style") merged[at] = { ...edit, css: { ...merged[at].css, ...edit.css } };
    else if (edit.kind === "image" && merged[at].kind === "image") merged[at] = { ...edit, copy: (merged[at] as typeof edit).copy ?? edit.copy };
    else if (edit.kind === "text" && merged[at].kind === "text") merged[at] = { ...edit, copy: (merged[at] as typeof edit).copy ?? edit.copy, was: (merged[at] as typeof edit).was ?? edit.was };
    else merged[at] = edit;
  }
  return merged;
}

/** One line for the version's "what changed". */
export function describeEdits(edits: Edit[]) {
  const copy = edits.filter((edit) => edit.kind === "text").length;
  const images = edits.filter((edit) => edit.kind === "image").length;
  const styled = edits.filter((edit) => edit.kind === "style").length;
  const props = edits.filter((edit) => edit.kind === "prop").length;
  const parts = [
    copy && `${copy} ${copy === 1 ? "line" : "lines"} of copy`,
    images && `${images} ${images === 1 ? "image" : "images"}`,
    styled && `styling on ${styled} ${styled === 1 ? "element" : "elements"}`,
    props && `${props} component ${props === 1 ? "prop" : "props"}`,
  ].filter(Boolean);
  return parts.length ? `Edited in the studio: ${parts.join(", ")}.` : "";
}

/**
 * The script that puts the edits on the page. Plain JavaScript in a string
 * because it runs inside the prototype, which has none of the studio's code.
 * Styles go in a stylesheet, so a framework re-rendering can't undo them;
 * copy and images are put back whenever the page changes underneath them.
 * An element that is no longer there is skipped, never an error.
 */
export function applierScript(always: Edit[], variants: EditVariant[] = []) {
  return `(function (always, variants) {
  var asked = new URLSearchParams(location.search).get(${JSON.stringify(VARIANT_PARAM)});
  var chosen = variants.filter(function (v) { return v.id === asked; })[0];
  var edits = chosen ? always.concat(chosen.edits) : always;
  var rules = edits.filter(function (e) { return e.kind === "style"; }).map(function (e) {
    return e.selector + "{" + Object.keys(e.css).map(function (p) { return p + ":" + e.css[p] + " !important"; }).join(";") + "}";
  }).join("\\n");
  var style = document.createElement("style");
  style.textContent = rules;
  document.head.appendChild(style);

  function read(el) {
    var out = "";
    el.childNodes.forEach(function (n) { out += n.nodeName === "BR" ? "\\n" : n.textContent; });
    return out;
  }
  function write(el, text) {
    el.replaceChildren.apply(el, text.split("\\n").flatMap(function (line, i) {
      return i ? [document.createElement("br"), document.createTextNode(line)] : [document.createTextNode(line)];
    }));
  }
  function apply() {
    edits.forEach(function (e) {
      var el = document.querySelector(e.selector);
      if (!el) return;
      if (e.kind === "text" && e.node !== undefined) {
        var piece = el.childNodes[e.node];
        if (piece && piece.nodeType === 3 && piece.textContent !== e.text) piece.textContent = e.text;
      } else if (e.kind === "text" && read(el) !== e.text) write(el, e.text);
      if (e.kind === "image") {
        if (el.tagName === "IMG") {
          if (el.getAttribute("src") !== e.src) { el.removeAttribute("srcset"); el.setAttribute("src", e.src); }
        } else {
          el.style.setProperty("background-image", 'url("' + e.src + '")', "important");
        }
      }
    });
  }
  var queued = 0;
  function soon() { if (!queued) queued = requestAnimationFrame(function () { queued = 0; apply(); }); }
  apply();
  document.addEventListener("DOMContentLoaded", apply);
  new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
})(${JSON.stringify(always)}, ${JSON.stringify(variants)});
`;
}
