"use client";

import { useEffect, useRef, useState } from "react";

import { PHONE_HEIGHT, PHONE_WIDTH } from "@/lib/phone";


/**
 * Previews that may be loading at once. A feed of six would otherwise open
 * six whole prototypes together, and the page would stutter while they all
 * parse; two at a time keeps the first screen quick, and the rest follow.
 */
const MAX_LOADING = 2;
/** A slot is given back after this long even if the prototype never says it has loaded. */
const LOAD_TIMEOUT_MS = 8000;

let loading = 0;
const waiting: Array<() => void> = [];

function pump() {
  while (loading < MAX_LOADING && waiting.length) {
    loading += 1;
    waiting.shift()?.();
  }
}

/** Join the line for a loading slot. Returns a function that gives it back, or leaves the line. */
function takeSlot(granted: () => void) {
  let state: "waiting" | "held" | "done" = "waiting";
  const entry = () => {
    state = "held";
    granted();
  };
  waiting.push(entry);
  pump();

  return () => {
    if (state === "waiting") waiting.splice(waiting.indexOf(entry), 1);
    else if (state === "held") {
      loading -= 1;
      pump();
    }
    state = "done";
  };
}

/**
 * The prototype itself, running, shrunk to fit the phone in a tile.
 *
 * It lays out at real phone width and is scaled down, so what you see is
 * the actual screen rather than a cramped one. It can't be touched: the
 * frame ignores the pointer, is out of the tab order and the
 * accessibility tree, doesn't scroll, and has a clear sheet over it, so a
 * click or a scroll lands on the tile and the feed.
 *
 * Kept cheap three ways. It only loads while its tile is near the screen,
 * and is taken down again when scrolled well away, so a long feed never
 * holds more than a screenful of prototypes. Loads go through a short
 * queue. And it asks for the preview version of the page, which has no
 * video or audio — usually the heaviest thing a prototype loads, and not
 * something a thumbnail needs. The grey behind stays until it has loaded, then the prototype fades in over it.
 */
export function LivePreview({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const release = useRef<() => void>(() => {});
  const [scale, setScale] = useState<number | null>(null);
  const [near, setNear] = useState(false);
  const [started, setStarted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const measured = scale !== null;

  useEffect(() => {
    const element = box.current;
    if (!element) return;

    const resize = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / PHONE_WIDTH));
    const visible = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: "400px",
    });
    resize.observe(element);
    visible.observe(element);
    return () => {
      resize.disconnect();
      visible.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!near || !measured) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    release.current = takeSlot(() => {
      setStarted(true);
      timer = setTimeout(() => release.current(), LOAD_TIMEOUT_MS);
    });
    return () => {
      clearTimeout(timer);
      release.current();
      setStarted(false);
      setLoaded(false);
    };
  }, [near, measured]);

  return (
    <div ref={box} className="absolute inset-0 isolate overflow-hidden [transform:translateZ(0)]">
      {started && scale ? (
        <iframe
          src={`${src}?preview`}
          title={title}
          aria-hidden
          tabIndex={-1}
          inert
          onLoad={() => {
            setLoaded(true);
            release.current();
          }}
          // Deprecated, but it is what stops Safari scrolling a frame inside.
          scrolling="no"
          sandbox="allow-scripts allow-same-origin"
          style={{ width: PHONE_WIDTH, height: PHONE_HEIGHT, transform: `scale(${scale})` }}
          data-ready={loaded || undefined}
          className="fade-in pointer-events-none origin-top-left border-0 bg-surface"
        />
      ) : null}
      {/* Safari lets a frame scroll even with pointer-events off. A sheet
       * over it takes the wheel and touch instead, and a page that can't
       * scroll under it lets the feed scroll as normal. */}
      <div aria-hidden className="absolute inset-0" />
    </div>
  );
}
