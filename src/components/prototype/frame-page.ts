import { anchorAt, anchorOf, elementAt, ownedBy, revealAnchor, scrollAt, spotOf, WAIT_FOR, type Box, type Reach, type Spot } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";
import { describePart, facesFor, hideWords, hoverBox, partIn, reachFrom, type From, type Face, type painter, type Part } from "@/lib/edit-part";
import type { Edit } from "@/lib/edits";
import { findClip, partBox, setMarks, sourceAt, type Clip, type Find, type SourceEl, type SourceHit } from "@/lib/handoff-clip";

/**
 * A prototype's page, for comments and for editing: what is at a point, where comments are on it, going to one, the
 * part picked to edit and the edits drawn on it.
 *
 * Most frames are on the studio's own address and are read directly (`src/lib/anchor.ts`). A live version is its dev
 * server, on another address the studio can't look into, so the same questions are put to the page by message and
 * answered from inside it by `src/lib/comment-bridge.ts`, which the prototype loads from the studio when asked (its
 * `src/lib/studio-comments.ts`). Both give the same anchors, since both are anchor.ts. Callers use one or the other
 * without knowing which; the only difference is that a page across addresses answers a moment later.
 */
export type FramePage = {
  /** The anchor for a click at (x, y) in the page's own pixels. Null when the page can't say. */
  anchorAt(x: number, y: number): Promise<Anchor | null>;
  /** The box of the element a comment at (x, y) would be pinned to, in the page's own pixels; null on the bare page. */
  boxAt(x: number, y: number, reach?: Reach): Promise<Box | null>;
  /** The part at (x, y), described for the edit panel (see `edit-part.ts`). Null on the bare page, or when the page can't say. */
  partAt(x: number, y: number, deep?: boolean, from?: From): Promise<Part | null>;
  /** The faces of the fonts a part's words are set in, with their files (see `facesFor`): what the studio needs to draw the same words the same way. */
  fonts(css: Record<string, string>): Promise<Face[]>;
  /** An anchor for the middle of the element a selector names, for a comment about it. Null when it isn't on the page. */
  anchorOf(selector: string): Promise<Anchor | null>;
  /** Scrolls what is under (x, y) by (dx, dy), all in the page's own pixels. */
  scrollAt(x: number, y: number, dx: number, dy: number): void;
  /**
   * Where each anchor is on screen now, by its key, leaving out those that aren't. A page across addresses is told
   * which anchors to follow and says where they are whenever they move (heard as a `studio:comments:spots` message);
   * this is what it said last. Null while the page can't be read (between pages).
   */
  spots(anchors: Record<string, Anchor>): Record<string, Spot> | null;
  /** Puts the page back where an anchor was left (see `revealAnchor`); `done` says whether it could be pinned there. Returns the way to stop. */
  reveal(anchor: Anchor, done: (found: boolean) => void): () => void;
  /** Only a static copy: the copy as a document an edit can be painted in (see `copyDocument`). */
  scope?: Document;
};

/**
 * The design system's component names while a live version is being edited (see `useDesignSystem`), told to its page
 * with each question, so what is picked or hovered inside one of them is the component. Null otherwise.
 */
let designSystem: string[] | null = null;
export const setDesignSystem = (names: string[] | null) => {
  designSystem = names;
};
export const designSystemNames = () => designSystem;

export function pageOf(frame: HTMLIFrameElement): FramePage {
  return frame.contentDocument ? near(frame) : across(frame);
}

/**
 * A canvas screen is inert, so nothing in it can be used, and an inert page isn't hit by `elementFromPoint`: it is
 * lifted for the moment it is read, and put back before anything is drawn.
 */
function hitting<T>(frame: HTMLIFrameElement, read: () => T): T {
  const inert = frame.inert;
  if (inert) frame.inert = false;
  try {
    return read();
  } finally {
    if (inert) frame.inert = true;
  }
}

/**
 * Draws a list of edits in every frame a version is on screen in (see `useEditSession`). A page the studio can read is
 * drawn here, by `brush`; one on another address is sent the list and draws it itself, with the same code, and is
 * sent it again when it loads again, so a live version that reloads under its edits still shows them. Pictures are
 * left out there: a swapped one is a file in the studio, which that page can't be shown.
 */
export function paintFrames(frames: HTMLIFrameElement[], edits: Edit[], brush: ReturnType<typeof painter>, pictures: Record<string, string> = {}, copies: Document[] = []) {
  const docs: Document[] = [...copies];
  for (const frame of frames) {
    const doc = frame.contentDocument;
    if (doc) {
      if (doc.body) docs.push(doc);
    } else if (frame.contentWindow) {
      const link = linkOf(frame.contentWindow);
      // A swapped picture is a file in the studio, which that page can't open: it is sent the picture itself (a data address), for those edits that use one.
      link.edits = edits;
      link.pictures = Object.fromEntries(edits.flatMap((edit) => (edit.kind === "image" && pictures[edit.src] ? [[edit.src, pictures[edit.src]]] : [])));
      send(frame.contentWindow, link, { type: "studio:edits:paint", edits: link.edits, pictures: link.pictures });
    }
  }
  brush.paint(docs, edits);
}

/**
 * Follows a part picked on a page on another address: `heard` is told how it is now each time it changes (an edit
 * drawn on it, the page scrolled or drawn again), and null when it is no longer there. Returns the way to stop.
 */
export function followPart(frame: HTMLIFrameElement, selector: string, heard: (part: Part | null) => void) {
  const win = frame.contentWindow;
  if (!win) return () => {};
  const link = linkOf(win);
  link.part = { selector, heard };
  send(win, link, { type: "studio:edits:follow", selector, components: designSystem });
  return () => {
    if (link.part?.heard !== heard) return;
    link.part = null;
    send(win, link, { type: "studio:edits:follow", selector: null });
  };
}

/**
 * Hides the words of the element `selector` names in a frame while they are typed over (see `hideWords`): directly on
 * the studio's own address, by message on another. Returns the way to show them again.
 */
export function hideWordsIn(frame: HTMLIFrameElement, selector: string) {
  const doc = frame.contentDocument;
  if (doc) return hideWords(doc, selector);
  const win = frame.contentWindow;
  if (!win) return () => {};
  const link = linkOf(win);
  link.hiding = selector;
  send(win, link, { type: "studio:edits:hide", selector });
  return () => {
    if (link.hiding !== selector) return;
    link.hiding = null;
    send(win, link, { type: "studio:edits:hide", selector: null });
  };
}

/** A part as a page on another address described it. */
const heardPart = (part: Part | null): Part | null => part;

/** A page on the studio's own address, read directly. */
function near(frame: HTMLIFrameElement): FramePage {
  const doc = () => (frame.contentDocument?.body ? frame.contentDocument : null);
  return {
    anchorAt: async (x, y) => {
      const page = doc();
      return page ? hitting(frame, () => anchorAt(page, x, y, ownedBy(frame))) : null;
    },
    partAt: async (x, y, deep = true, from) => {
      const page = doc();
      const element = page ? hitting(frame, () => reachFrom(page, elementAt(page, x, y), from) ?? (from?.into ? null : elementAt(page, x, y, deep))) : null;
      return element ? describePart(element) : null;
    },
    fonts: async (css) => {
      const page = doc();
      return page ? facesFor(page, css) : [];
    },
    anchorOf: async (selector) => {
      const page = doc();
      const element = page ? partIn(page, selector) : null;
      return page && element ? anchorOf(page, element, ownedBy(frame)) : null;
    },
    boxAt: async (x, y, reach = {}) => {
      const page = doc();
      if (!page) return null;
      return hitting(frame, () => hoverBox(page, x, y, reach, designSystem));
    },
    scrollAt: (x, y, dx, dy) => {
      const page = doc();
      if (page) hitting(frame, () => scrollAt(page, x, y, dx, dy));
    },
    spots: (anchors) => {
      const page = doc();
      if (!page) return null;
      return hitting(frame, () => {
        const found: Record<string, Spot> = {};
        for (const [key, anchor] of Object.entries(anchors)) {
          const spot = spotOf(page, anchor);
          if (spot) found[key] = spot;
        }
        return found;
      });
    },
    reveal: (anchor, done) => {
      const win = frame.contentWindow;
      if (!win) return () => {};
      // The frame may still be on its way to a live version (blank, or the page before, when this is asked): once it is
      // on that other address there is no document to read, and the page there is asked instead.
      let stop = () => {};
      let handed = false;
      const stopNear = revealAnchor(
        win,
        () => {
          if (frame.contentDocument || handed) return frame.contentDocument;
          handed = true;
          stop = across(frame).reveal(anchor, done);
          return null;
        },
        anchor,
        done,
      );
      return () => {
        stopNear();
        stop();
      };
    },
  };
}

// --- Across addresses ---

/** How long a question is waited for before the page is taken not to know (it may not have the helper). */
const ASK_MS = 1500;

type Ask = { id: number; what: "anchor" | "box" | "fonts" | "reveal" | "part" | "anchorOf" | "clip" | "mark" | "sourceAt" | "handoffPartBox" | "selectorBox"; x?: number; y?: number; deep?: boolean; groups?: boolean; from?: From; owns?: string[]; anchor?: Anchor; selector?: string; components?: string[]; css?: Record<string, string>; find?: Find; finds?: Find[]; colour?: string | null; elements?: SourceEl[]; part?: Find; index?: number };
type Link = {
  /** The page's own address, once it has said hello; questions wait until then. */
  origin: string | null;
  /** The anchors it is following, as sent, and the ones wanted. */
  sent: string;
  wanted: Record<string, Anchor>;
  spots: Record<string, Spot>;
  waiting: Map<number, { ask: Ask; answer: (value: unknown) => void }>;
  /** The edits drawn on it, and the part followed on it: both said again to a page that has loaded again. */
  edits: Edit[];
  /** The pictures those edits swap in, by the path they are saved at: data addresses. */
  pictures: Record<string, string>;
  part: { selector: string; heard: (part: Part | null) => void } | null;
  /** The words being typed over, hidden on the page: said again to a page that has loaded again. */
  hiding: string | null;
  /** Told when the page is scrolled down or back up. */
  scrolled: ((down: boolean) => void) | null;
};

const links = new WeakMap<Window, Link>();
let asked = 0;
let listening = false;

/** Sends a question now if the page is ready for it; otherwise it goes once the page says it is. */
const send = (win: Window, link: Link, message: object) => {
  if (link.origin) win.postMessage(message, link.origin);
};
const follow = (win: Window, link: Link) => {
  const anchors = JSON.stringify(link.wanted);
  if (!link.origin || anchors === link.sent) return;
  link.sent = anchors;
  send(win, link, { type: "studio:comments:watch", anchors: link.wanted });
};

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("message", (event) => {
    const data = event.data;
    const win = event.source as Window | null;
    const link = win ? links.get(win) : undefined;
    if (!win || !link || typeof data?.type !== "string" || !/^studio:(comments|edits):/.test(data.type)) return;
    switch (data.type) {
      // A new page in the frame, with the helper but not yet the bridge: it is asked to load it.
      case "studio:comments:here":
        link.origin = null;
        link.sent = "";
        link.spots = {};
        win.postMessage({ type: "studio:comments:load" }, event.origin);
        return;
      // The bridge is there: it is told what to follow, and asked again what the page it replaced never answered.
      case "studio:comments:ready":
        link.origin = event.origin;
        link.sent = "";
        follow(win, link);
        if (link.edits.length) send(win, link, { type: "studio:edits:paint", edits: link.edits, pictures: link.pictures });
        if (link.part) send(win, link, { type: "studio:edits:follow", selector: link.part.selector, components: designSystem });
        if (link.hiding) send(win, link, { type: "studio:edits:hide", selector: link.hiding });
        for (const { ask } of link.waiting.values()) send(win, link, { type: "studio:comments:ask", ...ask });
        return;
      case "studio:comments:answer": {
        if (event.origin !== link.origin) return;
        const waiting = link.waiting.get(data.id);
        link.waiting.delete(data.id);
        waiting?.answer(data.value ?? null);
        return;
      }
      case "studio:comments:spots":
        if (event.origin !== link.origin || typeof data.spots !== "object" || !data.spots) return;
        link.spots = data.spots;
        return;
      case "studio:comments:scrolled":
        if (event.origin === link.origin) link.scrolled?.(!!data.down);
        return;
      case "studio:edits:part":
        if (event.origin === link.origin) link.part?.heard(heardPart(data.part ?? null));
        return;
    }
  });
}

function linkOf(win: Window) {
  listen();
  let link = links.get(win);
  if (!link) {
    link = { origin: null, sent: "", wanted: {}, spots: {}, waiting: new Map(), edits: [], pictures: {}, part: null, hiding: null, scrolled: null };
    links.set(win, link);
    // "*": the page's address isn't known until it answers, and this carries nothing. A page whose helper has already
    // said hello (before comments were wanted here) loads the bridge on this; one still loading says hello itself.
    win.postMessage({ type: "studio:comments:load" }, "*");
  }
  return link;
}

/** Told whether a page on another address (a dev server) is scrolled down, through its bridge. */
export function watchScroll(frame: HTMLIFrameElement, told: (down: boolean) => void) {
  const win = frame.contentWindow;
  if (!win) return () => {};
  const link = linkOf(win);
  link.scrolled = told;
  return () => {
    if (link.scrolled === told) link.scrolled = null;
  };
}

/**
 * Told whether the page in a frame has been scrolled down (and not back up since), for an app bar that shrinks: read
 * from the page itself on the studio's own address, through the bridge on another. Returns the way to stop.
 */
export function watchScrolled(frame: HTMLIFrameElement, told: (down: boolean) => void) {
  const doc = frame.contentDocument;
  if (!doc) return watchScroll(frame, told);
  const last = new WeakMap<EventTarget, number>();
  const onScroll = (event: Event) => {
    const target = event.target as Document | Element;
    // The frame's own Document is another class from this page's, so `instanceof` can't tell it: its node type can.
    const element = target.nodeType === Node.DOCUMENT_NODE ? (target as Document).scrollingElement : (target as Element);
    const now = element?.scrollTop ?? 0;
    const before = last.get(target) ?? 0;
    last.set(target, now);
    if (now <= 0 || now < before - 4) told(false);
    else if (now > before + 4) told(true);
  };
  doc.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => doc.removeEventListener("scroll", onScroll, { capture: true });
}

/**
 * Where one of the page's elements is, for a handoff (see `handoff-clip.ts`): read directly on the studio's own address,
 * asked of the bridge on another. Called once the frame has loaded its page. Returns the way to stop.
 */
export function clipOf(frame: HTMLIFrameElement, find: Find, done: (clip: Clip | null) => void) {
  const win = frame.contentWindow;
  if (!win) {
    done(null);
    return () => {};
  }
  if (frame.contentDocument) return findClip(win, find, done);
  let stopped = false;
  // The page loads the bridge first, then looks for the element for as long as the studio's side would.
  void askOf<Clip | null>(win, { what: "clip", find }, 10000, null).then((clip) => stopped || done(clip));
  return () => void (stopped = true);
}

/** Which section of the code draws what is at a point in a page: read directly on the studio's own address, asked of the bridge on another. */
export function handoffSourceAt(frame: HTMLIFrameElement, x: number, y: number, elements: SourceEl[]) {
  const win = frame.contentWindow;
  if (!win) return Promise.resolve<SourceHit | null>(null);
  if (frame.contentDocument) return Promise.resolve(sourceAt(frame.contentDocument, x, y, elements));
  return askOf<SourceHit | null>(win, { what: "sourceAt", x, y, elements }, 3000, null);
}

/** Where the element a selector names is in a page (another copy of the one an element was selected in): its box, or null when it isn't there. */
export function selectorBox(frame: HTMLIFrameElement, selector: string) {
  const win = frame.contentWindow;
  if (!win) return Promise.resolve<SourceHit["box"] | null>(null);
  if (frame.contentDocument) {
    const element = frame.contentDocument.body ? partIn(frame.contentDocument, selector) : null;
    const rect = element?.getBoundingClientRect();
    return Promise.resolve(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
  }
  return askOf<SourceHit["box"] | null>(win, { what: "selectorBox", selector }, 3000, null);
}

/** Where a handoff's part is in another copy of the page (the same page on another device): its box, or null when it isn't there. */
export function handoffPartBox(frame: HTMLIFrameElement, part: Find, index: number) {
  const win = frame.contentWindow;
  if (!win) return Promise.resolve<SourceHit["box"] | null>(null);
  if (frame.contentDocument) return Promise.resolve(partBox(frame.contentDocument, part, index));
  return askOf<SourceHit["box"] | null>(win, { what: "handoffPartBox", part, index }, 3000, null);
}

/** Outlines what a handoff changed in the page (see `setMarks`), or takes the outlines away: directly, or through the bridge. */
export function markChanged(frame: HTMLIFrameElement, finds: Find[], colour: string | null) {
  const win = frame.contentWindow;
  if (!win) return;
  if (frame.contentDocument) return setMarks(frame.contentDocument, finds, colour);
  void askOf<boolean>(win, { what: "mark", finds, colour }, 5000, false);
}

/** Puts a question to a page on another address; `missing` if it hasn't answered in `wait`. */
function askOf<T>(win: Window | null, question: Omit<Ask, "id">, wait: number, missing: T) {
  return new Promise<T>((resolve) => {
    if (!win) return resolve(missing);
    const link = linkOf(win);
    const id = ++asked;
    const timer = window.setTimeout(() => {
      link.waiting.delete(id);
      resolve(missing);
    }, wait);
    link.waiting.set(id, {
      ask: { id, ...question },
      answer: (value) => {
        window.clearTimeout(timer);
        resolve((value ?? missing) as T);
      },
    });
    send(win, link, { type: "studio:comments:ask", id, ...question });
  });
}

/** A page on another address (a dev server), asked by message. */
function across(frame: HTMLIFrameElement): FramePage {
  const win = frame.contentWindow;
  const ask = <T>(question: Omit<Ask, "id">, wait = ASK_MS, missing: T) => askOf(win, question, wait, missing);
  return {
    // The keys the studio put in the frame's address are its own, whatever the page adds (see `ownedBy`).
    anchorAt: (x, y) => ask<Anchor | null>({ what: "anchor", x, y, owns: [...new URL(frame.src, window.location.href).searchParams.keys()] }, ASK_MS, null),
    boxAt: (x, y, reach = {}) => ask<Box | null>({ what: "box", x, y, deep: reach.deep !== false, groups: reach.groups, from: reach.from ? { selector: reach.from.selector, into: !!reach.from.into } : undefined, components: designSystem ?? undefined }, ASK_MS, null),
    partAt: (x, y, deep = true, from) => ask<Part | null>({ what: "part", x, y, deep, from, components: designSystem ?? undefined }, ASK_MS, null).then(heardPart),
    fonts: (css) => ask<Face[]>({ what: "fonts", css }, 8000, []),
    anchorOf: (selector) => ask<Anchor | null>({ what: "anchorOf", selector, owns: [...new URL(frame.src, window.location.href).searchParams.keys()] }, ASK_MS, null),
    scrollAt: (x, y, dx, dy) => {
      if (win) send(win, linkOf(win), { type: "studio:comments:scroll", x, y, dx, dy });
    },
    spots: (anchors) => {
      if (!win) return null;
      const link = linkOf(win);
      link.wanted = anchors;
      follow(win, link);
      // Only those still asked for: what it said may be from before the list changed.
      return Object.fromEntries(Object.entries(link.spots).filter(([key]) => key in anchors));
    },
    reveal: (anchor, done) => {
      let stopped = false;
      // Going to another path loads a new page, and the question is asked again of that one: allowed time for both.
      void ask<boolean>({ what: "reveal", anchor }, WAIT_FOR * 2, false).then((found) => stopped || done(found));
      return () => void (stopped = true);
    },
  };
}
