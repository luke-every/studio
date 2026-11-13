"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { Box } from "@/lib/anchor";

import { pageOf } from "./frame-page";

/**
 * A sheet of glass over a prototype, for while a click on it means something of the studio's (a comment left there, a
 * part picked to edit) rather than a press in the prototype: which element is under the pointer, to outline it, and
 * scrolling passed through, since the glass would otherwise take the wheel. `glass` goes on the sheet itself, which
 * calls `point` as the pointer moves over it (in the sheet's own pixels) and with null when it leaves.
 */
export function useGlass(frame: RefObject<HTMLIFrameElement | null>, scale: number, active: boolean) {
  // The element under the pointer: asked for at most once a frame, and a late answer (a page on another address) is
  // dropped if the pointer has moved on or left.
  const [target, setTarget] = useState<Box | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const asking = useRef(0);
  const point = (x: number | null, y = 0) => {
    pointer.current = x === null ? null : { x, y };
    if (x === null) {
      cancelAnimationFrame(asking.current);
      asking.current = 0;
      setTarget(null);
      return;
    }
    if (asking.current) return;
    asking.current = requestAnimationFrame(() => {
      asking.current = 0;
      const at = pointer.current;
      const element = frame.current;
      if (!at || !element) return;
      void pageOf(element).boxAt(at.x / scale, at.y / scale).then((found) => {
        if (pointer.current === at) setTarget(found);
      });
    });
  };
  useEffect(() => () => cancelAnimationFrame(asking.current), []);

  // The glass takes clicks, not scrolling: a wheel over it scrolls whatever in the prototype is under the pointer and can
  // still move that way, else the page, by the distance it moved on screen.
  const scroll = (event: WheelEvent) => {
    // The browser would scroll the page the glass is in as well, so it is told not to; this does the scrolling.
    event.preventDefault();
    const element = frame.current;
    if (!element) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    pageOf(element).scrollAt((event.clientX - box.left) / scale, (event.clientY - box.top) / scale, event.deltaX / scale, event.deltaY / scale);
    // What is under the pointer has moved under it.
    point(event.clientX - box.left, event.clientY - box.top);
  };

  // Listened to by hand: React's wheel handlers are passive, which can't stop the page scrolling too.
  const glass = useRef<HTMLDivElement>(null);
  const scrolling = useRef(scroll);
  useEffect(() => {
    scrolling.current = scroll;
  });
  useEffect(() => {
    const element = glass.current;
    if (!active || !element) return undefined;
    const onWheel = (event: WheelEvent) => scrolling.current(event);
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [active]);

  return { target, point, glass };
}
