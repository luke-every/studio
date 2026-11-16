"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLoadSlot } from "@/components/handoff/preview-queue";
import { clipOf } from "@/components/prototype/frame-page";
import type { Mark } from "@/lib/handoff";
import type { Suggestion } from "@/lib/handoff-suggest";
import type { Clip } from "@/lib/handoff-clip";
import type { Device } from "@/lib/phone";

/**
 * The frame beside the flow of a handed-off version: every component the designer marked as new, each drawn on its own
 * at every breakpoint that is on, side by side. Like the frame of new components a designer makes in Figma: engineers
 * see what they are being asked to build without finding it in a page.
 *
 * Each is the real element, cropped out of the design it was marked in (see `clipOf`), so it has the real words,
 * colours and data and not stand-ins. It lives in the canvas's own units, so it zooms with the screens; its type is
 * large for that reason, as the screens' names are drawn bigger than they read.
 */
const PAD = 64;
const ROW_GAP = 72;
const TILE_GAP = 32;
const TILE_PAD = 24;
const START_HEIGHT = 160;

/** One mark at one breakpoint: the element as that design draws it, at that width, on a light ground. */
function Tile({ mark, src, device, scale, priority }: { mark: Pick<Mark, "name" | "find">; src: string | undefined; device: Device; scale: number; priority: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { go, done } = useLoadSlot(priority);
  const [clip, setClip] = useState<Clip | "missing" | null>(src ? null : "missing");
  const stop = useRef<() => void>(() => {});
  const started = useRef(false);
  useEffect(() => () => stop.current(), []);
  useEffect(() => {
    if (clip) done();
  }, [clip, done]);

  const loaded = (element: HTMLIFrameElement) => {
    let blank = false;
    try {
      blank = element.contentWindow?.location.href === "about:blank";
    } catch {
      // On another address (a live version's dev server): loaded, and asked through the bridge.
    }
    if (blank || started.current) return;
    started.current = true;
    stop.current = clipOf(element, mark.find, (found) => setClip(found ?? "missing"));
  };

  const drawn = clip && clip !== "missing" ? clip : null;
  const size = drawn ? { width: drawn.width * scale, height: drawn.height * scale } : { width: device.width * scale, height: START_HEIGHT * scale };
  return (
    <div style={{ padding: TILE_PAD }} className="shrink-0 rounded-[var(--r-lg)] bg-surface-elevated">
      <div style={size} className="relative overflow-hidden">
        {clip === "missing" ? (
          <p style={{ fontSize: 20 }} className="absolute inset-0 grid place-items-center text-foreground-subtle">
            No preview
          </p>
        ) : go && src ? (
          <iframe
            ref={frame}
            src={src}
            sandbox="allow-scripts allow-forms allow-same-origin"
            title={`${mark.name}, ${device.name}`}
            aria-hidden
            tabIndex={-1}
            onLoad={(event) => loaded(event.currentTarget)}
            style={{
              width: device.width,
              // As tall as the window, or as the element needs to be whole.
              height: drawn ? Math.max(device.height, Math.ceil(drawn.top + drawn.height)) : device.height,
              transform: drawn ? `scale(${scale}) translate(${-drawn.left}px, ${-drawn.top}px)` : `scale(${scale})`,
              transformOrigin: "0 0",
            }}
            className={`pointer-events-none absolute left-0 top-0 block max-w-none border-0 bg-transparent ${drawn ? "" : "opacity-0"}`}
          />
        ) : null}
        {clip === null ? <span aria-hidden className="pulse-soft absolute inset-0 bg-surface-hover" /> : null}
      </div>
    </div>
  );
}

/** A button in the frame's own units: it zooms with everything else. */
function FrameButton({ children, onClick, solid = false }: { children: string; onClick: () => void; solid?: boolean }) {
  return (
    <button
      type="button"
      // The canvas pans from a press anywhere on it; this is a press on a button.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      style={{ fontSize: 20, padding: "8px 24px" }}
      className={`rounded-[var(--r-full)] font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] ${solid ? "bg-[var(--sheet-foreground)] text-[var(--sheet)] hover:opacity-90" : "text-[var(--sheet-muted)] hover:text-[var(--sheet-foreground)]"}`}
    >
      {children}
    </button>
  );
}

export function ComponentsFrame({
  marks,
  suggestions = [],
  onAccept,
  onDismiss,
  pages,
  devices,
  scale,
  onSize,
  left,
}: {
  marks: Mark[];
  /** What the scan thinks is new and isn't marked: shown faded, to add or turn away. */
  suggestions?: Suggestion[];
  onAccept?: (suggestion: Suggestion) => void;
  onDismiss?: (id: string) => void;
  /** The address of each design's page, by the design's id. */
  pages: Record<string, string>;
  devices: Device[];
  /** How big a screen is drawn, as a share of its device's real size: components are drawn to the same. */
  scale: number;
  /** Told its size in the canvas's units, so the canvas can fit it with the screens. */
  onSize: (size: { width: number; height: number }) => void;
  /** Where it stands: after the last screen. */
  left: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const tell = () => onSize({ width: element.offsetWidth, height: element.offsetHeight });
    tell();
    const observer = new ResizeObserver(tell);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onSize]);
  return (
    <div
      ref={box}
      aria-label="New components"
      style={{ left, top: 0, padding: PAD, gap: ROW_GAP }}
      className="absolute flex w-max flex-col rounded-[var(--r-xl)] bg-[var(--sheet)] text-[var(--sheet-foreground)]"
    >
      <h2 style={{ fontSize: 32 }} className="font-medium">
        Components
      </h2>
      {marks.map((mark, row) => (
        <section key={mark.id} className="flex flex-col" style={{ gap: TILE_GAP }}>
          <h3 style={{ fontSize: 24 }} className="font-medium">
            {mark.name}
          </h3>
          <div className="flex items-start" style={{ gap: TILE_GAP }}>
            {devices.map((device) => (
              <figure key={device.id} className="flex flex-col" style={{ gap: 16 }}>
                <figcaption style={{ fontSize: 20 }} className="text-[var(--sheet-muted)]">
                  {device.name}
                </figcaption>
                <Tile mark={mark} src={pages[mark.screen]} device={device} scale={scale} priority={row} />
              </figure>
            ))}
          </div>
        </section>
      ))}
      {suggestions.map((suggestion, index) => (
        <section key={suggestion.id} className="flex flex-col" style={{ gap: TILE_GAP }}>
          <h3 style={{ fontSize: 24, gap: 24 }} className="flex items-center font-medium">
            <span className="flex items-baseline" style={{ gap: 16 }}>
              {suggestion.name}
              <span style={{ fontSize: 20 }} className="font-normal text-[var(--sheet-muted)]">
                Suggested
              </span>
            </span>
            <span className="flex items-center" style={{ gap: 8 }}>
              <FrameButton solid onClick={() => onAccept?.(suggestion)}>
                Add
              </FrameButton>
              <FrameButton onClick={() => onDismiss?.(suggestion.id)}>Dismiss</FrameButton>
            </span>
          </h3>
          <div className="flex items-start opacity-60" style={{ gap: TILE_GAP }}>
            {devices.map((device) => (
              <figure key={device.id} className="flex flex-col" style={{ gap: 16 }}>
                <figcaption style={{ fontSize: 20 }} className="text-[var(--sheet-muted)]">
                  {device.name}
                </figcaption>
                <Tile mark={suggestion} src={pages[suggestion.screen]} device={device} scale={scale} priority={marks.length + index} />
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
