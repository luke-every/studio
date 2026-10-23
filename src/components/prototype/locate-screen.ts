import type { Anchor } from "@/lib/comments";
import { withParams, type Flow, type FlowScreen } from "@/lib/flow";

import { nearestOf, spotOf } from "./comment-parts";

/** How often a screen is asked, while it loads and plays its entrance. */
const POLL = 50;
/** How long one screen is given before it is taken to be the wrong one. */
const PER_SCREEN = 1500;

/**
 * Which of a flow's screens a comment was left on. A prototype can swap one
 * step for another without changing its address, so the address says nothing
 * about it; the only way to know is to look. Each screen is loaded out of
 * sight, all at once at the size of the frame, and asked whether the comment's element is
 * there, showing, and the page says what it said. The first to say yes wins.
 * If none does, the screen where most of its path is there is the nearest
 * (`exact` false): a prototype can read differently for whoever opens it.
 * Null if no screen has any of it.
 */
export function locateScreen(
  base: string,
  flow: Flow,
  size: { width: number; height: number },
  anchor: Anchor,
) {
  return new Promise<{ screen: FlowScreen; exact: boolean } | null>((resolve) => {
    const frames: HTMLIFrameElement[] = [];
    let pending = flow.screens.length;
    let finished = false;
    let nearest: { screen: FlowScreen; depth: number } | null = null;

    const finish = (hit: FlowScreen | null) => {
      if (finished) return;
      finished = true;
      frames.forEach((frame) => frame.remove());
      resolve(hit ? { screen: hit, exact: true } : nearest && { screen: nearest.screen, exact: false });
    };

    flow.screens.forEach((screen) => {
      const frame = document.createElement("iframe");
      frame.src = withParams(base, screen.params);
      frame.setAttribute(
        "sandbox",
        "allow-scripts allow-forms allow-same-origin",
      );
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${size.width}px;height:${size.height}px;border:0;opacity:0;pointer-events:none`;
      // Asked as it loads rather than once it has finished: the element is on screen a fraction of a second in, long
      // before the page's images are done, and a screen that never has it is given up on soon after.
      const started = Date.now();
      const ask = () => {
        if (finished) return;
        try {
          const doc = frame.contentDocument;
          if (
            doc &&
            frame.contentWindow?.location.href !== "about:blank" &&
            doc.readyState !== "loading"
          ) {
            if (spotOf(doc, anchor)) {
              finish(screen);
              return;
            }
            const near = doc.location.pathname === anchor.screen ? nearestOf(doc, anchor) : null;
            if (near && near.depth > (nearest?.depth ?? 0)) nearest = { screen, depth: near.depth };
          }
        } catch {
          // A screen that can't be read has nothing to say.
        }
        if (Date.now() - started > PER_SCREEN) {
          if (--pending === 0) finish(null);
          return;
        }
        setTimeout(ask, POLL);
      };
      setTimeout(ask, POLL);
      frames.push(frame);
      document.body.append(frame);
    });

    setTimeout(() => finish(null), PER_SCREEN + 2000);
  });
}
