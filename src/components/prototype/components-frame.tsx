"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useLoadSlot } from "@/components/handoff/preview-queue";
import { sandboxDocument } from "@/components/handoff/sandbox";
import type { Handoff } from "@/lib/handoff";
import type { Clip } from "@/lib/handoff-clip";
import type { PublicComponent } from "@/lib/handoff-public";
import type { Device } from "@/lib/phone";

/**
 * The frame beside the flow of a handed-off version: every component the designer decided is new, or extends
 * production's, each drawn on its own at every breakpoint that is on, side by side. Engineers see what they are being
 * asked to build without finding it in a page.
 *
 * It lives in the canvas's own units, so it zooms with the screens; its type is large for that reason, as the screens'
 * names are drawn bigger than they read. A component is drawn in a frame of its own (see `sandbox.ts`) at the
 * breakpoint's width and as tall as it turns out to be.
 */
const PAD = 64;
const ROW_GAP = 72;
const TILE_GAP = 32;
const START_HEIGHT = 160;
const GIVE_UP_MS = 15000;

type Look = { theme: Handoff["theme"]; fontBase: string };

const isClip = (value: unknown): value is Clip => {
  const clip = value as Clip | null;
  return !!clip && ["left", "top", "width", "height"].every((key) => Number.isFinite(clip[key as keyof Clip])) && clip.width > 0 && clip.height > 0;
};

/** One component at one breakpoint: its width, as tall as it is, on a light ground. */
function Tile({ component, device, scale, look, priority }: { component: PublicComponent; device: Device; scale: number; look: Look; priority: number }) {
  const id = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const { go, done } = useLoadSlot(priority);
  const [state, setState] = useState<Clip | "failed" | null>(null);
  const srcDoc = useMemo(() => sandboxDocument({ module: component.module, name: component.name, props: component.props, theme: look.theme, fontBase: look.fontBase, id, width: device.width }), [component, look, id, device.width]);

  useEffect(() => {
    if (state) done();
  }, [state, done]);
  useEffect(() => {
    if (!go) return;
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.id !== id) return;
      setState(event.data.type === "handoff:drawn" && isClip(event.data.clip) ? event.data.clip : "failed");
    };
    window.addEventListener("message", listen);
    const timer = window.setTimeout(() => setState((now) => now ?? "failed"), GIVE_UP_MS);
    return () => {
      window.removeEventListener("message", listen);
      window.clearTimeout(timer);
    };
  }, [id, go]);

  // The page is as tall as the component and the room round it (its top is the room above).
  const page = state && state !== "failed" ? Math.ceil(state.top * 2 + state.height) : START_HEIGHT;
  return (
    <div style={{ width: device.width * scale, height: page * scale }} className="relative shrink-0 overflow-hidden rounded-[var(--r-lg)] bg-surface-elevated">
      {state === "failed" ? (
        <p style={{ fontSize: 20 }} className="absolute inset-0 grid place-items-center text-foreground-subtle">
          No preview
        </p>
      ) : go ? (
        <iframe
          ref={frame}
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          title={`${component.name}, ${device.name}`}
          aria-hidden
          tabIndex={-1}
          style={{ width: device.width, height: page, transform: `scale(${scale})`, transformOrigin: "0 0" }}
          className={`pointer-events-none absolute left-0 top-0 block max-w-none border-0 bg-transparent ${state ? "" : "opacity-0"}`}
        />
      ) : null}
      {state === null ? <span aria-hidden className="pulse-soft absolute inset-0 bg-surface-hover" /> : null}
    </div>
  );
}

export function ComponentsFrame({
  items,
  theme,
  fontBase,
  devices,
  scale,
  onSize,
  left,
}: {
  items: PublicComponent[];
  theme: Handoff["theme"];
  fontBase: string;
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
  const look = { theme, fontBase };
  return (
    <div
      ref={box}
      aria-label="New and extended components"
      style={{ left, top: 0, padding: PAD, gap: ROW_GAP }}
      className="absolute flex w-max flex-col rounded-[var(--r-xl)] bg-[var(--sheet)] text-[var(--sheet-foreground)]"
    >
      <h2 style={{ fontSize: 32 }} className="font-medium">
        Components
      </h2>
      {items.map((component, row) => (
        <section key={component.id} className="flex flex-col" style={{ gap: TILE_GAP }}>
          <h3 style={{ fontSize: 24, gap: 16 }} className="flex items-baseline font-medium">
            {component.name}
            <span style={{ fontSize: 20 }} className="font-normal text-[var(--sheet-muted)]">
              {component.action === "new" ? "New" : component.extends ? `Extends ${component.extends}` : "Extended"}
            </span>
          </h3>
          <div className="flex items-start" style={{ gap: TILE_GAP }}>
            {devices.map((device) => (
              <figure key={device.id} className="flex flex-col" style={{ gap: 16 }}>
                <figcaption style={{ fontSize: 20 }} className="text-[var(--sheet-muted)]">
                  {device.name}
                </figcaption>
                <Tile component={component} device={device} scale={scale} look={look} priority={row} />
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
