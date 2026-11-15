/**
 * Finding one of a prototype's elements in its running page, for a handoff to show it as it is drawn there.
 *
 * The scanner records how to find it (`mine.find` in a finding, see .claude/skills/handoff/scan.mjs): its tag, the
 * classes it always has, and the first words inside it. Plain DOM, no React: the studio runs it on a page it can read,
 * and the comment bridge (`comment-bridge.ts`) runs it inside a live version's page, which the studio can't.
 */

/** `component`: every instance of a component by its name (a running dev page knows its components' names; a built one doesn't). */
export type Find = { tag?: string; classes: string[]; text?: string; component?: string };
/** Where the element is in the page's window, once it has been scrolled into view, and the window's size. */
export type Clip = { left: number; top: number; width: number; height: number; viewWidth: number; viewHeight: number };

/** How long a page is given to draw the element (it may still be loading what it shows). */
const WAIT_MS = 5000;
const EVERY_MS = 150;

export function isFind(value: unknown): value is Find {
  const find = value as Find | null;
  return !!find && typeof find === "object" && Array.isArray(find.classes) && find.classes.every((cls) => typeof cls === "string");
}

const words = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();

/** The element on screen that matches, preferring one that says the words; null when none is drawn. */
export function elementFor(doc: Document, find: Find): Element | null {
  const selector = `${find.tag ?? ""}${find.classes.map((cls) => `.${CSS.escape(cls)}`).join("")}`;
  if (!selector) return null;
  let all: Element[];
  try {
    all = Array.from(doc.querySelectorAll(selector));
  } catch {
    return null;
  }
  const shown = all.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  });
  return (find.text ? shown.find((element) => words(element).includes(find.text!)) : undefined) ?? shown[0] ?? null;
}

/**
 * Waits for the element, scrolls the window so it is in the middle (by the window's own scroll, never scrollIntoView,
 * which would scroll the studio around the frame too), and says where it is. `done(null)` when it never turns up.
 * Returns the way to stop.
 */
export function findClip(win: Window, find: Find, done: (clip: Clip | null) => void) {
  const since = Date.now();
  let timer = 0;
  const look = () => {
    const element = win.document.body ? elementFor(win.document, find) : null;
    if (!element) {
      if (Date.now() - since < WAIT_MS) timer = win.setTimeout(look, EVERY_MS);
      else done(null);
      return;
    }
    const before = element.getBoundingClientRect();
    win.scrollTo({ top: Math.max(0, win.scrollY + before.top - Math.max(0, (win.innerHeight - before.height) / 2)), behavior: "instant" });
    // Measured once the scroll has been drawn.
    win.requestAnimationFrame(() =>
      win.requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        done({ left: rect.left, top: rect.top, width: rect.width, height: rect.height, viewWidth: win.innerWidth, viewHeight: win.innerHeight });
      }),
    );
  };
  look();
  return () => win.clearTimeout(timer);
}

const selectorOf = (find: Find) => `${find.tag ?? ""}${find.classes.map((cls) => `.${CSS.escape(cls)}`).join("")}`;
const MARKS = "studio-handoff-marks";

import { componentOf } from "@/lib/edit-part";

/**
 * Outlines every element that matches one of `finds` in the page (a style rule, so nothing in the page's own markup is
 * touched), or takes the outlines away when `colour` is null. Used to show what a handoff changed.
 */
export function setMarks(doc: Document, finds: Find[], colour: string | null) {
  doc.getElementById(MARKS)?.remove();
  doc.querySelectorAll("[data-handoff-mark]").forEach((element) => element.removeAttribute("data-handoff-mark"));
  const selectors = finds.filter((find) => find.classes.length || find.tag).map(selectorOf);
  const names = new Set(finds.flatMap((find) => (find.component ? [find.component] : [])));
  if (!colour || !(selectors.length || names.size) || !doc.head || !doc.body) return;
  // A component is outlined where it starts: the elements whose nearest component of that name is themselves.
  if (names.size) {
    doc.body.querySelectorAll("*").forEach((element) => {
      if (componentOf(element, names)?.root === element) element.setAttribute("data-handoff-mark", "");
    });
    selectors.push("[data-handoff-mark]");
  }
  const style = doc.createElement("style");
  style.id = MARKS;
  // The colour is a computed value from the studio's own tokens; nothing else can reach the rule.
  style.textContent = `${selectors.join(",")}{outline:2px solid ${colour.replace(/[;{}]/g, "")} !important;outline-offset:2px !important;}`;
  doc.head.append(style);
}
