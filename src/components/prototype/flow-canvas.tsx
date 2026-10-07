"use client";

import { useEffect, useRef, useState } from "react";

import { FitIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import { bestPerRow, layoutFlow, withParams, type Flow, type FlowScreen } from "@/lib/flow";
import type { Device } from "@/lib/phone";

/** How big a screen is drawn on the canvas, as a share of the phone's real size. */
const SCREEN_SCALE = 0.5;
const GAP = { x: 140, y: 90 };
const LABEL_HEIGHT = 26;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2;

type View = { x: number; y: number; scale: number };

/**
 * The flow of a prototype as a canvas: every screen, live, with an arrow for
 * each tap that leads to another. Drag to pan, pinch or ⌘-scroll to zoom,
 * click a screen to select it and double-click to open it.
 *
 * Everything that has to stay the same size however far you zoom — the
 * names, the arrows and their labels — is drawn in screen space over the
 * canvas; only the screens themselves live in the zoomed world.
 */
export function FlowCanvas({
  flow,
  base,
  device,
  onOpen,
}: {
  flow: Flow;
  /** The prototype's address, without any screen's parameters. */
  base: string;
  device: Device;
  onOpen: (screen: FlowScreen) => void;
}) {
  const node = { width: device.width * SCREEN_SCALE, height: device.height * SCREEN_SCALE };
  const cell = { width: node.width + GAP.x, height: node.height + GAP.y + LABEL_HEIGHT };
  // How many screens to a row is chosen once, from the room there is when it opens.
  const [perRow, setPerRow] = useState<number | undefined>(undefined);
  const { placed, width, height } = layoutFlow(flow, cell, perRow);
  // The screens sit below their names.
  const at = (id: string) => {
    const spot = placed.get(id)!;
    return { x: spot.x, y: spot.y + LABEL_HEIGHT };
  };

  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [selected, setSelected] = useState<string | null>(null);

  const fitted = (room: { width: number; height: number }, extent = { width, height }): View => {
    const pad = 56;
    const scale = Math.min(1, (room.width - pad * 2) / (extent.width - GAP.x), (room.height - pad * 2) / (extent.height - GAP.y));
    const clamped = Math.max(MIN_ZOOM, scale);
    return { scale: clamped, x: (room.width - (extent.width - GAP.x) * clamped) / 2, y: (room.height - (extent.height - GAP.y) * clamped) / 2 };
  };

  // Fit what there is to the room, once it has been measured.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const room = { width: entry.contentRect.width, height: entry.contentRect.height };
      setSize(room);
      if (first) {
        first = false;
        const n = bestPerRow(flow, cell, { width: room.width - 112 + GAP.x, height: room.height - 112 + GAP.y });
        setPerRow(n);
        setView(fitted(room, layoutFlow(flow, cell, n)));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zoomAt = (px: number, py: number, factor: number) =>
    setView((now) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, now.scale * factor));
      const k = scale / now.scale;
      return { scale, x: px - (px - now.x) * k, y: py - (py - now.y) * k };
    });

  // Pinch (which arrives as ctrl-wheel) and ⌘-scroll zoom; plain scrolling pans.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01));
      } else {
        setView((now) => ({ ...now, x: now.x - event.deltaX, y: now.y - event.deltaY }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const drag = useRef<{ x: number; y: number; from: View; moved: boolean } | null>(null);
  const toScreen = (x: number, y: number) => ({ x: view.x + x * view.scale, y: view.y + y * view.scale });

  const arrows = flow.edges.flatMap((edge, i) => {
    if (!placed.has(edge.from) || !placed.has(edge.to)) return [];
    const from = at(edge.from);
    const to = at(edge.to);
    const sameRow = Math.abs(to.y - from.y) < node.height / 2;
    let path: string;
    let mid: { x: number; y: number };
    let room: number;
    if (sameRow && to.x > from.x) {
      // On along the row: out of the right edge, into the left.
      const a = toScreen(from.x + node.width, from.y + node.height / 2);
      const b = toScreen(to.x, to.y + node.height / 2);
      const reach = Math.max(24, Math.abs(b.x - a.x) / 2);
      path = `M${a.x},${a.y} C${a.x + reach},${a.y} ${b.x - reach},${b.y} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      room = Math.abs(b.x - a.x);
    } else if (to.y > from.y) {
      // Down to the next row: out of the bottom, into the top.
      const a = toScreen(from.x + node.width / 2, from.y + node.height);
      const b = toScreen(to.x + node.width / 2, to.y);
      const reach = Math.max(30, Math.abs(b.y - a.y) / 2);
      path = `M${a.x},${a.y} C${a.x},${a.y + reach} ${b.x},${b.y - reach} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      room = Math.abs(b.y - a.y);
    } else {
      // Back to something earlier: round underneath.
      const a = toScreen(from.x + node.width / 2, from.y + node.height);
      const b = toScreen(to.x + node.width / 2, to.y + node.height);
      const reach = 60 + 30 * view.scale;
      path = `M${a.x},${a.y} C${a.x},${a.y + reach} ${b.x},${b.y + reach} ${b.x},${b.y}`;
      mid = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + reach * 0.75 };
      room = Infinity;
    }
    const active = selected === edge.from || selected === edge.to;
    // A label needs room to sit in: it shows when the gap is wide enough, or when the arrow is selected.
    return [{ key: `${edge.from}-${edge.to}-${i}`, path, mid, label: active || room >= 80 ? edge.label : undefined, active }];
  });

  return (
    <div
      ref={box}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, from: view, moved: false };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || event.buttons !== 1) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 4) return;
        start.moved = true;
        setView({ ...start.from, x: start.from.x + dx, y: start.from.y + dy });
      }}
      onPointerUp={() => {
        // Letting go of a drag isn't a click on anything.
        if (!drag.current?.moved) setSelected(null);
        window.setTimeout(() => (drag.current = null), 0);
      }}
      style={{
        backgroundImage: "radial-gradient(var(--border-strong) 1px, transparent 1px)",
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      className="absolute inset-0 touch-none overflow-hidden rounded-[var(--r-tile)] bg-tile active:cursor-grabbing"
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {flow.screens.map((screen) => {
          const spot = at(screen.id);
          return (
            <button
              key={screen.id}
              type="button"
              onPointerUp={(event) => {
                if (drag.current?.moved) return;
                event.stopPropagation();
                setSelected(screen.id);
              }}
              onDoubleClick={() => onOpen(screen)}
              aria-label={`${screen.name}. Double-click to open.`}
              aria-pressed={selected === screen.id}
              style={{
                left: spot.x,
                top: spot.y,
                width: node.width,
                height: node.height,
                // The selection outline stays two pixels wide however far in or out you are.
                outline: selected === screen.id ? `${2 / view.scale}px solid var(--focus-ring)` : undefined,
                outlineOffset: 3 / view.scale,
              }}
              className="absolute block overflow-hidden rounded-[calc(var(--r-device)*0.5)] bg-surface text-left"
            >
              <ScreenFrame src={`${withParams(base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}preview`} device={device} />
            </button>
          );
        })}
      </div>

      {size ? (
        <>
          <svg aria-hidden width={size.width} height={size.height} className="pointer-events-none absolute inset-0 text-foreground-subtle">
            <defs>
              <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M1 1.5 9 5 1 8.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            {arrows.map((arrow) => (
              <path
                key={arrow.key}
                d={arrow.path}
                fill="none"
                stroke={arrow.active ? "var(--foreground)" : "currentColor"}
                strokeWidth="1.5"
                markerEnd="url(#flow-arrow)"
                style={{ color: arrow.active ? "var(--foreground)" : undefined }}
              />
            ))}
          </svg>

          {arrows.map((arrow) =>
            arrow.label ? (
              <span
                key={`${arrow.key}-label`}
                style={{ left: arrow.mid.x, top: arrow.mid.y }}
                className="pointer-events-none absolute max-w-48 -translate-x-1/2 -translate-y-1/2 truncate rounded-[var(--r-full)] bg-surface px-2.5 py-1 text-xs text-foreground-muted"
              >
                {arrow.label}
              </span>
            ) : null,
          )}

          {flow.screens.map((screen) => {
            const spot = toScreen(at(screen.id).x, at(screen.id).y);
            return (
              <span
                key={`${screen.id}-name`}
                style={{ left: spot.x, top: spot.y - 22, maxWidth: Math.max(60, node.width * view.scale) }}
                className="pointer-events-none absolute truncate text-xs font-medium text-foreground-muted"
              >
                {screen.name}
              </span>
            );
          })}
        </>
      ) : null}

      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <IconButton label="Zoom out" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1 / 1.25)}>
          <span className="text-md leading-none">−</span>
        </IconButton>
        <span className="min-w-12 text-center text-ui font-medium text-foreground-muted">{Math.round(view.scale * 100)}%</span>
        <IconButton label="Zoom in" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1.25)}>
          <span className="text-md leading-none">+</span>
        </IconButton>
        <IconButton label="Fit to the room" onClick={() => size && setView(fitted(size))}>
          <FitIcon className="size-[1.125rem]" />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * One screen, live, at the phone's own size and scaled down. It loads only
 * once it has come near the visible part of the canvas, and then stays.
 */
function ScreenFrame({ src, device }: { src: string; device: Device }) {
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} className="size-full">
      {near ? (
        <iframe
          src={src}
          title="Screen"
          tabIndex={-1}
          style={{ width: device.width, height: device.height, transform: `scale(${SCREEN_SCALE})` }}
          className="pointer-events-none block origin-top-left border-0"
          sandbox="allow-scripts allow-forms allow-same-origin"
        />
      ) : (
        <div aria-hidden className="pulse-soft size-full bg-surface" />
      )}
    </div>
  );
}
