"use client";

import { useEffect, useRef } from "react";

/** How often pins are read anyway, for what moves without saying so (an animation partway through). */
const ANYWAY_MS = 1000;
const LISTEN = { capture: true, passive: true } as const;

/**
 * Calls `read` whenever a pin over these frames could have moved, and at most once a frame: something in a prototype
 * scrolled, changed, finished a transition or loaded; the window resized; the studio around the frames moved; or what
 * the caller reads changed (`inputs`). Nothing is read while the tab is hidden. It replaces reading every frame, which
 * with the page's text read for each comment kept the browser laying the prototype out sixty times a second.
 *
 * A frame that loads a new page is a new document, so the documents are looked at again each time, and listened to anew.
 */
export function usePinWatch(
  frames: () => (HTMLIFrameElement | null | undefined)[],
  read: () => void,
  active: boolean,
  inputs: unknown[],
) {
  const latest = useRef({ frames, read });
  useEffect(() => {
    latest.current = { frames, read };
  });
  const schedule = useRef(() => {});

  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const watched = new Map<Document, () => void>();
    const later = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };
    const watch = (doc: Document) => {
      const changes = new MutationObserver(later);
      changes.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
      const events = ["scroll", "transitionend", "animationend", "load"];
      events.forEach((name) => doc.addEventListener(name, later, LISTEN));
      const win = doc.defaultView;
      win?.addEventListener("resize", later);
      return () => {
        changes.disconnect();
        events.forEach((name) => doc.removeEventListener(name, later, LISTEN));
        win?.removeEventListener("resize", later);
      };
    };
    const sync = () => {
      const docs = new Set<Document>();
      for (const frame of latest.current.frames()) {
        try {
          if (frame?.contentDocument?.documentElement) docs.add(frame.contentDocument);
        } catch {
          // A frame that can't be read has no pins.
        }
      }
      for (const [doc, stop] of watched) {
        if (!docs.has(doc)) {
          stop();
          watched.delete(doc);
        }
      }
      for (const doc of docs) if (!watched.has(doc)) watched.set(doc, watch(doc));
    };
    function run() {
      raf = 0;
      if (document.hidden) return;
      sync();
      latest.current.read();
    }
    schedule.current = later;

    // The studio around the frames: a frame loading (heard here as it happens), the page scrolling, a panel sliding.
    const around = ["load", "scroll", "transitionend"];
    around.forEach((name) => document.addEventListener(name, later, LISTEN));
    window.addEventListener("resize", later);
    document.addEventListener("visibilitychange", later);
    const timer = window.setInterval(later, ANYWAY_MS);
    later();
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(timer);
      around.forEach((name) => document.removeEventListener(name, later, LISTEN));
      window.removeEventListener("resize", later);
      document.removeEventListener("visibilitychange", later);
      watched.forEach((stop) => stop());
      schedule.current = () => {};
    };
  }, [active]);

  // What is read changed: read it again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => schedule.current(), inputs);
}
