"use client";

import { useEffect } from "react";

/**
 * The studio is never zoomed as a page: a pinch or ⌘-scroll that reaches the window (over a panel, the bar, anywhere the canvas isn't
 * listening) would zoom the whole browser tab and leave it zoomed, and the canvas has its own zoom. Taken in the capture phase, so no
 * element has to remember to; the canvas hears the same events as before. ⌘+ and ⌘− are taken too, but ⌘0 is left alone: it is how a tab
 * that is already zoomed gets back to 100%.
 */
export function NoPageZoom() {
  useEffect(() => {
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) event.preventDefault();
    };
    // Safari sends a pinch as gesture events, not as ctrl-wheel.
    const gesture = (event: Event) => event.preventDefault();
    const keys = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (["+", "=", "-", "_"].includes(event.key)) event.preventDefault();
    };
    window.addEventListener("wheel", wheel, { passive: false, capture: true });
    window.addEventListener("keydown", keys, { capture: true });
    for (const name of ["gesturestart", "gesturechange", "gestureend"]) window.addEventListener(name, gesture, { capture: true });
    return () => {
      window.removeEventListener("wheel", wheel, { capture: true });
      window.removeEventListener("keydown", keys, { capture: true });
      for (const name of ["gesturestart", "gesturechange", "gestureend"]) window.removeEventListener(name, gesture, { capture: true });
    };
  }, []);
  return null;
}
