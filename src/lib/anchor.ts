import type { Anchor } from "@/lib/comments";
import { selectorFor } from "@/lib/edit-dom";

/**
 * Where a comment is left in a prototype, and finding that place again.
 *
 * Plain DOM, no React: the studio uses it, and it is built into
 * `public/studio-anchor.js` for the phone's comment script (see
 * `scripts/build-anchor.ts`), so a comment left anywhere describes its place
 * the same way.
 */

export type Spot = { x: number; y: number };
export type Box = { left: number; top: number; width: number; height: number };
/** Whether a key in the prototype's address is the studio's (a control, a variant, the review token) rather than the prototype's own. */
export type StudioOwns = (key: string) => boolean;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const snippet = (element: Element) =>
  (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * What a page is saying, in a few words: the start of its visible text, with
 * numbers and punctuation left out so a counter or a clock doesn't change it.
 * Steps of a flow share one address and often one layout, so this is what
 * tells them apart.
 */
export function pageKey(doc: Document) {
  return (doc.body?.innerText ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * The prototype's own place in its address: the query it set itself (not the
 * studio's) and its hash, as `?step=2#done`. Empty when it has none.
 */
export function stateOf(location: Pick<Location, "search" | "hash">, studioOwns: StudioOwns) {
  const own = new URLSearchParams();
  new URLSearchParams(location.search).forEach((value, key) => {
    if (!studioOwns(key)) own.append(key, value);
  });
  const query = own.toString();
  return `${query ? `?${query}` : ""}${location.hash}`;
}

/**
 * Where to send a frame so it shows an anchor's screen: its page, and its hash
 * when it noted one. The query is the comment's setup, which the studio puts
 * back itself (without loading the page again when the prototype takes its
 * controls live), so it is left as it is here. Null when the frame is there already.
 */
export function addressFor(location: Location, anchor: Anchor) {
  const url = new URL(location.href);
  url.pathname = anchor.screen;
  if (anchor.state !== undefined) {
    const hashAt = anchor.state.indexOf("#");
    url.hash = hashAt < 0 ? "" : anchor.state.slice(hashAt);
  }
  return url.pathname === location.pathname && url.hash === location.hash ? null : url.href;
}

/** For a frame whose address the studio set: every key in that address is the studio's, whatever the prototype adds after. */
export function ownedBy(frame: HTMLIFrameElement): StudioOwns {
  const keys = new URL(frame.src, window.location.href).searchParams;
  return (key) => keys.has(key);
}

/** A tap a comment's place depends on: what was tapped, found again the way a comment's element is. */
export type Step = { selector: string; text?: string };

// The taps since each document's address last changed. A new page is a new document, so it starts with none.
const taps = new WeakMap<Document, { search: string; list: Step[] }>();
const TAPPABLE = "button, a, [role=button], [role=tab], [role=menuitem], [role=option], summary, label, input, select";
/** How many taps a comment keeps: enough for a sheet opened from a menu opened from a card. */
const STEPS = 5;

/**
 * Notes each tap in a prototype's page, so a comment left on something it opened over the page (a sheet, a menu, a
 * modal), which its address doesn't say, can be gone back to by tapping the same things again. A change of address
 * starts the list over: from there the address says where it is. Taps outside the page's body (the studio's own
 * phone layer) aren't the prototype's.
 */
export function watchTaps(doc: Document) {
  const heard = (event: Event) => {
    const node = event.target as Element | null;
    if (!node || node.nodeType !== 1 || !doc.body?.contains(node)) return;
    const tapped = node.closest(TAPPABLE) ?? node;
    const now = taps.get(doc);
    const list = now && now.search === doc.location.search ? now.list : [];
    const step = { selector: selectorFor(tapped), text: snippet(tapped) || undefined };
    taps.set(doc, { search: doc.location.search, list: [...list, step].slice(-STEPS) });
  };
  doc.addEventListener("click", heard, true);
  return () => doc.removeEventListener("click", heard, true);
}

/** The element a comment at (x, y) in a document's own pixels is pinned to, or null on the bare page. */
export function elementAt(doc: Document, x: number, y: number) {
  const hit = doc.elementFromPoint(x, y);
  return hit && hit !== doc.body && hit !== doc.documentElement ? hit : null;
}

/** The box of that element, in the document's own pixels, for the studio to outline while somebody chooses where to comment. */
export function boxAt(doc: Document, x: number, y: number): Box | null {
  const rect = elementAt(doc, x, y)?.getBoundingClientRect();
  return rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
}

/** The anchor for a click at (x, y) in a document's own pixels. */
export function anchorAt(doc: Document, x: number, y: number, studioOwns: StudioOwns): Anchor {
  return anchorOn(doc, elementAt(doc, x, y), x, y, studioOwns);
}

/** The anchor for the middle of an element, for a comment that is about it rather than left by a click. */
export function anchorOf(doc: Document, element: Element, studioOwns: StudioOwns): Anchor {
  const box = element.getBoundingClientRect();
  return anchorOn(doc, element, box.left + box.width / 2, box.top + box.height / 2, studioOwns);
}

function anchorOn(doc: Document, element: Element | null, x: number, y: number, studioOwns: StudioOwns): Anchor {
  const win = doc.defaultView!;
  const root = doc.documentElement;
  const rect = element?.getBoundingClientRect();
  const tapped = taps.get(doc);
  return {
    screen: doc.location.pathname,
    state: stateOf(doc.location, studioOwns),
    page: pageKey(doc),
    selector: element ? selectorFor(element) : null,
    text: element ? snippet(element) || undefined : undefined,
    steps: tapped && tapped.search === doc.location.search && tapped.list.length ? tapped.list : undefined,
    x: rect && rect.width ? clamp((x - rect.left) / rect.width) : 0,
    y: rect && rect.height ? clamp((y - rect.top) / rect.height) : 0,
    fx: clamp((x + win.scrollX) / Math.max(1, root.scrollWidth)),
    fy: clamp((y + win.scrollY) / Math.max(1, root.scrollHeight)),
  };
}

/** The element an anchor (or a step) was made on, if it is on screen now: there, showing, and still saying what it said. */
export function elementOf(doc: Document, anchor: { selector: string | null; text?: string }): Element | null {
  if (!anchor.selector) return null;
  let element: Element | null = null;
  try {
    element = doc.querySelector(anchor.selector);
  } catch {
    // A selector that no longer parses is an element that is gone.
  }
  if (!element) return null;
  if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  if (anchor.text && snippet(element) !== anchor.text) return null;
  return element;
}

/**
 * Scrolls a document so an anchor's point is in the middle of the view: the element into view, then whatever scrolls
 * it, by what is left. The point and not the element, since an element can be taller than the screen.
 */
export function bringIntoView(doc: Document, element: Element, anchor: Anchor) {
  element.scrollIntoView({ block: "center", inline: "center" });
  const win = doc.defaultView!;
  const rect = element.getBoundingClientRect();
  const off = rect.top + anchor.y * rect.height - win.innerHeight / 2;
  if (Math.abs(off) < 1) return;
  for (let node = element.parentElement; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
    if (/auto|scroll|overlay/.test(win.getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
      node.scrollBy(0, off);
      return;
    }
  }
  win.scrollBy(0, off);
}

/**
 * Where an anchor is in a document, in its own pixels, or null when it isn't
 * on this screen right now. A prototype can draw a step over the one before,
 * so a comment shows only where its element is there, uncovered, and still
 * says what it said. Which step it is, the prototype's address says.
 */
export function spotOf(doc: Document, anchor: Anchor): Spot | null {
  if (anchor.screen !== doc.location.pathname) return null;
  if (!anchor.selector) {
    const root = doc.documentElement;
    const win = doc.defaultView!;
    return {
      x: anchor.fx * root.scrollWidth - win.scrollX,
      y: anchor.fy * root.scrollHeight - win.scrollY,
    };
  }
  const element = elementOf(doc, anchor);
  const rect = element?.getBoundingClientRect();
  if (!element || !rect || !(rect.width || rect.height)) return null;
  const spot = {
    x: rect.left + anchor.x * rect.width,
    y: rect.top + anchor.y * rect.height,
  };
  // It has to be what you would see there: a step drawn over the top of it, or the page scrolled past it, hides the pin.
  const hit = doc.elementFromPoint(spot.x, spot.y);
  if (!hit || !(element.contains(hit) || hit.contains(element))) return null;
  return spot;
}

/**
 * Scrolls whatever is under (x, y) and can still move that way, else the page, by (dx, dy) in the document's own
 * pixels: a wheel over the studio's glass while somebody places a comment, which the page itself never hears.
 */
export function scrollAt(doc: Document, x: number, y: number, dx: number, dy: number) {
  const win = doc.defaultView!;
  for (let element = doc.elementFromPoint(x, y); element && element !== doc.documentElement && element !== doc.body; element = element.parentElement) {
    const style = win.getComputedStyle(element);
    const canY = /auto|scroll|overlay/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const canX = /auto|scroll|overlay/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
    const roomY = dy < 0 ? element.scrollTop > 0 : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    const roomX = dx < 0 ? element.scrollLeft > 0 : element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    if ((canY && dy && roomY) || (canX && dx && roomX)) {
      element.scrollBy(dx, dy);
      return;
    }
  }
  win.scrollBy(dx, dy);
}

/** How long a comment's element is waited for once its setup is on screen: the prototype may still be moving there, or fetching what it shows. It is pinned the moment it is there. */
export const WAIT_FOR = 4000;
/** How long a tap that opened it is waited for before it is passed over. */
const STEP_WAIT = 600;

/**
 * Puts a page back where a comment was left: its path and hash, then the comment's point into view, tapping again
 * what opened the sheet or menu it was left on when its element isn't on the page. `done` is told whether it could be
 * pinned there in the end. Returns the way to stop.
 *
 * `docOf` is asked each time, since sending the page to another path makes a new document. Run from inside the page
 * (a prototype the studio can't see into), going to another path ends this with the page; the studio asks again once
 * the new one is there, and by then the path is right.
 *
 * Looked at as soon as the markup is in, never waiting for images: a frame that has only just been given its address
 * is still on a blank page, or still reading, and is looked at again in a moment.
 */
export function revealAnchor(win: Window, docOf: () => Document | null, anchor: Anchor, done: (found: boolean) => void) {
  let timer = 0;
  let since = 0;
  // The taps that opened what it was left on, made again one at a time, each once what it taps is there.
  const steps = anchor.steps ?? [];
  let step = 0;
  let stepSince = 0;
  // Finished once it can be pinned: there, in view and uncovered. Until then it is looked at again.
  const reveal = () => {
    const doc = docOf();
    if (!doc) return;
    since ||= Date.now();
    const target = anchor.selector ? elementOf(doc, anchor) : null;
    if (target) bringIntoView(doc, target, anchor);
    else if (!anchor.selector) win.scrollTo(0, anchor.fy * doc.documentElement.scrollHeight - win.innerHeight / 2);
    if (spotOf(doc, anchor)) return done(true);
    // Not on the page: it was left on something opened over it. A tap whose button never turns up is passed over.
    if (!target && step < steps.length) {
      const button = elementOf(doc, steps[step]);
      stepSince ||= Date.now();
      if (button) (button as HTMLElement).click();
      if (button || Date.now() - stepSince > STEP_WAIT) {
        step += 1;
        stepSince = 0;
      }
      // Its own wait starts after the last tap.
      since = Date.now();
      timer = window.setTimeout(reveal, 100);
      return;
    }
    if (Date.now() - since < WAIT_FOR) timer = window.setTimeout(reveal, 100);
    else done(false);
  };

  // Sent to the comment's page or hash once, if it isn't on it, and looked at again until it has arrived.
  let sent = 0;
  const start = () => {
    // No document to read: the frame has gone to an address that can't be looked into, and the window can't be asked either.
    const doc = docOf();
    if (!doc) return;
    const to = win.location.href === "about:blank" || doc.readyState === "loading" ? "wait" : addressFor(win.location, anchor);
    if (to && to !== "wait" && !sent) {
      sent = Date.now();
      win.location.assign(to);
    }
    if (to && Date.now() - (sent || Date.now()) < WAIT_FOR) timer = window.setTimeout(start, 30);
    else reveal();
  };

  start();
  return () => window.clearTimeout(timer);
}
