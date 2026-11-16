import { anchorAt, anchorOf, boxAt, elementAt, revealAnchor, scrollAt, spotOf, watchTaps, type Spot } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";
import { componentOf, describePart, painter, partIn, reachFrom } from "@/lib/edit-part";
import type { Edit } from "@/lib/edits";
import { findClip, isFind, partBox, setMarks, sourceAt } from "@/lib/handoff-clip";

/**
 * Comments on, and edits to, a prototype the studio can't see into: a live version, running on its own dev server at
 * another address. For editing it describes the part picked and draws the list of edits the studio sends, as a preview
 * on this page only: nothing here writes to the prototype's code. Built into `public/studio-comments.js` (see `scripts/build-anchor.ts`) and loaded into the prototype's page
 * by its `src/lib/studio-comments.ts` when the studio asks, it answers the studio's questions from inside the page
 * with the studio's own anchor code, so a comment left here is described exactly as one left on a pushed version.
 * The studio's side is `src/components/prototype/frame-page.ts`.
 *
 * It only ever answers the window it is framed in, at the address it was loaded from, and draws nothing.
 */

/** How often the comments followed are looked at anyway, for what moves without saying so (an animation partway through). */
const ANYWAY_MS = 1000;

(() => {
  const own = window as Window & { __studioComments?: boolean };
  const script = document.currentScript as HTMLScriptElement | null;
  if (window.parent === window || own.__studioComments || !script?.src) return;
  own.__studioComments = true;
  const studio = new URL(script.src).origin;
  const tell = (message: object) => window.parent.postMessage(message, studio);

  // What the page's taps opened, for a comment left on a sheet or a menu the address doesn't remember.
  watchTaps(document);

  // The comments the studio is showing, and where they are: said again whenever one moves, at most once a frame.
  let anchors: Record<string, Anchor> = {};
  let last = "";
  let raf = 0;
  // The edits the studio is previewing here, and the part it has picked: its description is said again whenever it changes.
  const brush = painter();
  let edits: Edit[] = [];
  let following: string | null = null;
  // The design system's component names, when the studio is editing: what is picked inside one of them is the component.
  let components: string[] | undefined;
  let lastPart = "";
  const report = () => {
    raf = 0;
    if (!document.body) return;
    // The page may have drawn itself again under the edits (a framework, a hot reload): they are put back where they are missing.
    if (edits.length) brush.keep([document], edits);
    if (following) {
      const element = partIn(document, following);
      const part = element ? describePart(element, components) : null;
      const said = JSON.stringify(part);
      if (said !== lastPart) {
        lastPart = said;
        tell({ type: "studio:edits:part", part });
      }
    }
    if (Object.keys(anchors).length) {
      const spots: Record<string, Spot> = {};
      for (const [key, anchor] of Object.entries(anchors)) {
        const spot = spotOf(document, anchor);
        if (spot) spots[key] = spot;
      }
      const said = JSON.stringify(spots);
      if (said !== last) {
        last = said;
        tell({ type: "studio:comments:spots", spots });
      }
    }
    // What this did to the page itself (an edit put back, a part measured) is not the page changing: it isn't looked at again for it.
    changes.takeRecords();
  };
  const later = () => {
    if (!raf) raf = requestAnimationFrame(report);
  };
  const LISTEN = { capture: true, passive: true } as const;
  const changes = new MutationObserver(later);
  changes.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  ["scroll", "transitionend", "animationend", "load"].forEach((name) => document.addEventListener(name, later, LISTEN));
  window.addEventListener("resize", later);
  window.setInterval(later, ANYWAY_MS);

  // Whether the page has been scrolled down (and not back up since), said when it changes: for an app's bar that shrinks.
  const lastTop = new WeakMap<EventTarget, number>();
  let scrolledDown = false;
  document.addEventListener(
    "scroll",
    (event) => {
      const target = event.target as Document | Element;
      const element = target.nodeType === Node.DOCUMENT_NODE ? (target as Document).scrollingElement : (target as Element);
      const now = element?.scrollTop ?? 0;
      const before = lastTop.get(target) ?? 0;
      lastTop.set(target, now);
      const down = now <= 0 || now < before - 4 ? false : now > before + 4 ? true : scrolledDown;
      if (down === scrolledDown) return;
      scrolledDown = down;
      tell({ type: "studio:comments:scrolled", down });
    },
    LISTEN,
  );

  let stop = () => {};
  let stopClip = () => {};
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (event.source !== window.parent || event.origin !== studio || typeof data?.type !== "string") return;
    const answer = (value: unknown) => tell({ type: "studio:comments:answer", id: data.id, value });
    const point = typeof data.x === "number" && typeof data.y === "number";
    switch (data.type) {
      // Asked to load when it already has: the studio's page has started over (its code reloaded while this page stayed), so it is told again that this is here.
      case "studio:comments:load":
        tell({ type: "studio:comments:ready" });
        return;
      case "studio:comments:watch":
        anchors = data.anchors && typeof data.anchors === "object" ? data.anchors : {};
        last = "";
        later();
        return;
      case "studio:edits:paint":
        edits = Array.isArray(data.edits) ? data.edits : [];
        if (document.body) brush.paint([document], edits);
        later();
        return;
      case "studio:edits:follow":
        following = typeof data.selector === "string" ? data.selector : null;
        components = Array.isArray(data.components) ? data.components : undefined;
        lastPart = "";
        later();
        return;
      case "studio:comments:scroll":
        if (point && document.body) scrollAt(document, data.x, data.y, Number(data.dx) || 0, Number(data.dy) || 0);
        return;
      case "studio:comments:ask":
        if (data.what === "box") {
          const names = Array.isArray(data.components) ? new Set<string>(data.components) : null;
          const reach = { deep: data.deep !== false, groups: data.groups === true };
          // A component is picked whole only when reaching in (⌘); otherwise it is the top-level group that is.
          const hit = names && reach.deep && point && document.body ? elementAt(document, data.x, data.y) : null;
          const found = hit && names ? componentOf(hit, names) : null;
          if (found) {
            const { left, top, width, height } = found.root.getBoundingClientRect();
            return answer({ left, top, width, height, component: true });
          }
          return answer(point && document.body ? boxAt(document, data.x, data.y, reach) : null);
        }
        if (data.what === "part") {
          const from = data.from && typeof data.from.selector === "string" ? { selector: data.from.selector, into: !!data.from.into } : undefined;
          const element = point && document.body ? reachFrom(document, elementAt(document, data.x, data.y), from) ?? (from?.into ? null : elementAt(document, data.x, data.y, data.deep !== false)) : null;
          return answer(element ? describePart(element, Array.isArray(data.components) ? data.components : undefined) : null);
        }
        if (data.what === "anchorOf") {
          const element = typeof data.selector === "string" ? partIn(document, data.selector) : null;
          const owns = new Set<string>(Array.isArray(data.owns) ? data.owns : []);
          return answer(element ? anchorOf(document, element, (key) => owns.has(key)) : null);
        }
        if (data.what === "anchor") {
          const owns = new Set<string>(Array.isArray(data.owns) ? data.owns : []);
          return answer(point && document.body ? anchorAt(document, data.x, data.y, (key) => owns.has(key)) : null);
        }
        // A handoff showing one of this page's elements: where it is, once it is in view.
        if (data.what === "clip") {
          stopClip();
          if (!isFind(data.find)) return answer(null);
          stopClip = findClip(window, data.find, answer);
          return;
        }
        // A handoff's part at a point: which one it is, and its box.
        if (data.what === "sourceAt") {
          const elements = Array.isArray(data.elements) ? data.elements.filter((item: { file?: unknown; find?: unknown }) => typeof item?.file === "string" && isFind(item.find)) : [];
          return answer(point && document.body ? sourceAt(document, data.x, data.y, elements) : null);
        }
        if (data.what === "selectorBox") {
          const element = typeof data.selector === "string" && document.body ? partIn(document, data.selector) : null;
          const rect = element?.getBoundingClientRect();
          return answer(rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null);
        }
        if (data.what === "handoffPartBox") return answer(document.body && isFind(data.part) ? partBox(document, data.part, Number(data.index) || 0) : null);
        // A handoff outlining what it changed.
        if (data.what === "mark") {
          setMarks(document, Array.isArray(data.finds) ? data.finds.filter(isFind) : [], typeof data.colour === "string" ? data.colour : null);
          return answer(true);
        }
        if (data.what === "reveal" && data.anchor) {
          stop();
          stop = revealAnchor(window, () => document, data.anchor, answer);
        }
        return;
    }
  });

  tell({ type: "studio:comments:ready" });
})();
