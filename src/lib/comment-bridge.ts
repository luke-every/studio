import { anchorAt, anchorOf, boxAt, elementAt, revealAnchor, scrollAt, spotOf, watchTaps, type Spot } from "@/lib/anchor";
import type { Anchor } from "@/lib/comments";
import { describePart, painter, partIn } from "@/lib/edit-part";
import type { Edit } from "@/lib/edits";

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
  let lastPart = "";
  const report = () => {
    raf = 0;
    if (!document.body) return;
    // The page may have drawn itself again under the edits (a framework, a hot reload): they are put back where they are missing.
    if (edits.length) brush.keep([document], edits);
    if (following) {
      const element = partIn(document, following);
      const part = element ? describePart(element) : null;
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

  let stop = () => {};
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
        lastPart = "";
        later();
        return;
      case "studio:comments:scroll":
        if (point && document.body) scrollAt(document, data.x, data.y, Number(data.dx) || 0, Number(data.dy) || 0);
        return;
      case "studio:comments:ask":
        if (data.what === "box") return answer(point && document.body ? boxAt(document, data.x, data.y) : null);
        if (data.what === "part") {
          const element = point && document.body ? elementAt(document, data.x, data.y) : null;
          return answer(element ? describePart(element) : null);
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
        if (data.what === "reveal" && data.anchor) {
          stop();
          stop = revealAnchor(window, () => document, data.anchor, answer);
        }
        return;
    }
  });

  tell({ type: "studio:comments:ready" });
})();
