"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { FitIcon } from "@/components/shell/nav-icons";
import { IconButton } from "@/components/ui/button";
import type { Anchor } from "@/lib/comments";
import { bestPerRow, layoutFlow, withParams, type Flow, type FlowScreen } from "@/lib/flow";
import type { Device } from "@/lib/phone";
import { applyEmbed } from "@/lib/embed";
import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

import { anchorAt, Card, CommentCard, Composer, DraftPin, pageKey, Pin, spotOf, type CommentsUi, type Spot } from "./comment-parts";

/** How big a screen is drawn on the canvas, as a share of the phone's real size. */
const SCREEN_SCALE = 0.5;
const GAP = { x: 140, y: 90 };
const LABEL_HEIGHT = 26;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2;
/** Room kept clear around what is fitted: the top is where the toolbar sits over the canvas. */
const INSET = { top: 104, side: 56 };
/** How much a double-click zooms in. */
const DOUBLE_CLICK_ZOOM = 1.6;
/** How long the room has to stay the same size to count as settled. */
const SETTLE_MS = 80;

type View = { x: number; y: number; scale: number };

/**
 * The flow of a prototype as a canvas: every screen, live, with an arrow for
 * each tap that leads to another. Drag to pan, pinch or ⌘-scroll to zoom,
 * click a screen to select it and double-click to open it; double-click the
 * canvas itself to zoom in there.
 *
 * Nothing is laid out until the room has stopped changing — it opens while the
 * page's side column is still closing — so what is fitted is centred in the
 * room it ends up with. The screens then show as skeletons for a moment while
 * they load and play their own entrance animations out of sight, and fade in
 * together.
 *
 * Comments show on the screens they were left on, and can be left on any
 * screen: a click on one is turned into a place inside that screen's own page.
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
  comments,
  wireframe = false,
}: {
  flow: Flow;
  /** The prototype's address, without any screen's parameters. */
  base: string;
  device: Device;
  onOpen: (screen: FlowScreen) => void;
  comments?: CommentsUi;
  /** The same wireframe look the prototype is shown in. */
  wireframe?: boolean;
}) {
  const node = { width: device.width * SCREEN_SCALE, height: device.height * SCREEN_SCALE };
  const cell = { width: node.width + GAP.x, height: node.height + GAP.y + LABEL_HEIGHT };
  // How many screens to a row is chosen once, from the room there is once it has settled.
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
  // Until somebody pans or zooms, the canvas keeps what it shows fitted and centred as the room changes.
  const touched = useRef(false);

  // Comments: each screen is its own live page, so a comment is looked for in every one of them.
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const [found, setFound] = useState<{ key: string; id: string; screenId: string; spot: Spot }[]>([]);
  const [draft, setDraft] = useState<{ anchor: Anchor; screenId: string } | null>(null);
  // Where the canvas is in the window, so a card can be drawn outside its clipping and still sit by its pin.
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  const placing = !!comments?.placing;
  const [wasPlacing, setWasPlacing] = useState(false);
  if (placing !== wasPlacing) {
    setWasPlacing(placing);
    // Leaving comment mode drops one that was never posted.
    if (!placing) setDraft(null);
  }

  // The part of the canvas that isn't under the toolbar.
  const clear = (room: { width: number; height: number }) => ({ width: room.width - INSET.side * 2, height: room.height - INSET.top - INSET.side });

  const fitted = (room: { width: number; height: number }, extent = { width, height }): View => {
    const space = clear(room);
    const content = { width: extent.width - GAP.x, height: extent.height - GAP.y };
    const scale = Math.max(MIN_ZOOM, Math.min(1, space.width / content.width, space.height / content.height));
    return { scale, x: (room.width - content.width * scale) / 2, y: INSET.top + (space.height - content.height * scale) / 2 };
  };

  // Lay out once the room has stopped changing, and keep it fitted as it changes after, until somebody moves it.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let rows: number | undefined;
    let timer = 0;
    const observer = new ResizeObserver(([entry]) => {
      const room = { width: entry.contentRect.width, height: entry.contentRect.height };
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (rows === undefined) {
          const space = clear(room);
          rows = bestPerRow(flow, cell, { width: space.width + GAP.x, height: space.height + GAP.y });
          setPerRow(rows);
        }
        setSize(room);
        if (!touched.current) setView(fitted(room, layoutFlow(flow, cell, rows)));
      }, SETTLE_MS);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = comments?.list;
  const visible = !!comments?.visible;
  useEffect(() => {
    if (!visible || !list) return;
    let last = "";
    // Where things are inside a screen only changes when the screen does, so this needn't run every frame, which with a dozen screens would be a lot of reading.
    const tick = () => {
      const next: typeof found = [];
      for (const screen of flow.screens) {
        const doc = frames.current.get(screen.id)?.contentDocument;
        if (!doc?.body) continue;
        const page = pageKey(doc);
        for (const comment of list) {
          const spot = spotOf(doc, comment.anchor, page);
          if (spot) next.push({ key: `${comment.id}@${screen.id}`, id: comment.id, screenId: screen.id, spot });
        }
        const draftSpot = draft?.screenId === screen.id ? spotOf(doc, draft.anchor, page) : null;
        if (draftSpot) next.push({ key: "draft", id: "draft", screenId: screen.id, spot: draftSpot });
      }
      const rect = box.current?.getBoundingClientRect();
      const moved = { left: rect?.left ?? 0, top: rect?.top ?? 0 };
      const signature = JSON.stringify([next, moved]);
      if (signature !== last) {
        last = signature;
        setFound(next);
        setOrigin(moved);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [visible, list, draft, flow]);

  // Asked for a comment: zoom to the screen it is on, filling the clear part of the canvas.
  const here = useRef(found);
  useEffect(() => {
    here.current = found;
  });
  const asked = comments?.focus;
  useEffect(() => {
    if (!asked || !size) return;
    const entry = here.current.find((item) => item.id === asked.id);
    if (!entry) return;
    const spot = at(entry.screenId);
    const space = clear(size);
    const scale = Math.min(MAX_ZOOM, space.width / node.width, space.height / node.height);
    touched.current = true;
    setView({ scale, x: size.width / 2 - (spot.x + node.width / 2) * scale, y: INSET.top + space.height / 2 - (spot.y + node.height / 2) * scale });
    // Only when asked, not each time the layout or the size moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked]);

  const zoomAt = (px: number, py: number, factor: number) => {
    touched.current = true;
    setView((now) => {
      const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, now.scale * factor));
      const k = scale / now.scale;
      return { scale, x: px - (px - now.x) * k, y: py - (py - now.y) * k };
    });
  };

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
        touched.current = true;
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

  const place = (event: React.MouseEvent<HTMLDivElement>) => {
    // Letting go of a drag isn't a click on anything.
    if (drag.current?.moved || !comments) return;
    const rect = box.current!.getBoundingClientRect();
    const world = { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale };
    const screen = flow.screens.find((item) => {
      const spot = at(item.id);
      return world.x >= spot.x && world.x <= spot.x + node.width && world.y >= spot.y && world.y <= spot.y + node.height;
    });
    const doc = screen ? frames.current.get(screen.id)?.contentDocument : null;
    if (!screen || !doc?.body) return;
    const spot = at(screen.id);
    comments.onFocus(null);
    setDraft({ screenId: screen.id, anchor: { ...anchorAt(doc, (world.x - spot.x) / SCREEN_SCALE, (world.y - spot.y) / SCREEN_SCALE), flowScreen: screen.id } });
  };
  // Where a spot inside a screen is, on the canvas as it is now and in the window.
  const onCanvas = (screenId: string, spot: Spot) => toScreen(at(screenId).x + spot.x * SCREEN_SCALE, at(screenId).y + spot.y * SCREEN_SCALE);
  const inWindow = (point: { x: number; y: number }) => ({ left: origin.left + point.x, top: origin.top + point.y });
  const openComment = comments?.list.find((item) => item.id === comments.focus?.id);
  const openAt = found.find((item) => item.id === openComment?.id);
  const draftAt = found.find((item) => item.key === "draft");

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
        touched.current = true;
        setView({ ...start.from, x: start.from.x + dx, y: start.from.y + dy });
      }}
      onDoubleClick={(event) => {
        // A screen opens on a double-click, and while placing a comment a click is a comment.
        if (placing || (event.target as Element).closest("button") || !box.current) return;
        const rect = box.current.getBoundingClientRect();
        zoomAt(event.clientX - rect.left, event.clientY - rect.top, DOUBLE_CLICK_ZOOM);
      }}
      onPointerUp={() => {
        // Letting go of a drag isn't a click on anything.
        if (!drag.current?.moved) setSelected(null);
        window.setTimeout(() => (drag.current = null), 0);
      }}
      style={{
        backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      className="absolute inset-0 touch-none overflow-hidden rounded-[var(--r-tile)] active:cursor-grabbing"
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, visibility: size ? undefined : "hidden" }}>
        {/* Skeletons first, where every screen will be; the live screens fade in over them together. */}
        {size
          ? flow.screens.map((screen) => {
              const spot = at(screen.id);
              return (
                <div
                  key={`${screen.id}-skeleton`}
                  aria-hidden
                  style={{ left: spot.x, top: spot.y, width: node.width, height: node.height }}
                  className="pulse-soft absolute rounded-[calc(var(--r-device)*0.5)] bg-surface"
                />
              );
            })
          : null}
        <div data-ready={size ? "" : undefined} className="flow-reveal">
        {size ? flow.screens.map((screen) => {
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
              <ScreenFrame wireframe={wireframe} register={(element) => (element ? frames.current.set(screen.id, element) : frames.current.delete(screen.id))} src={`${withParams(base, screen.params)}${Object.keys(screen.params).length ? "&" : "?"}preview`} device={device} />
            </button>
          );
        }) : null}
        </div>
      </div>

      {placing ? <div onClick={place} className="absolute inset-0 cursor-crosshair" /> : null}

      {/* Everything drawn over the screens fades in with them, and the pins with it. */}
      <div data-ready={size ? "" : undefined} className="flow-reveal pointer-events-none absolute inset-0">
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

      {size && comments && visible ? (
        <div className="absolute inset-0">
          {found
            .filter((item) => item.key !== "draft")
            .map((item) => {
              const comment = comments.list.find((entry) => entry.id === item.id);
              const point = onCanvas(item.screenId, item.spot);
              if (!comment) return null;
              return (
                <Pin
                  key={item.key}
                  comment={comment}
                  left={point.x}
                  top={point.y}
                  selected={comments.focus?.id === comment.id}
                  onClick={() => comments.onFocus(comments.focus?.id === comment.id ? null : comment.id)}
                />
              );
            })}
          {draft && draftAt ? <DraftPin left={onCanvas(draftAt.screenId, draftAt.spot).x} top={onCanvas(draftAt.screenId, draftAt.spot).y} /> : null}
        </div>
      ) : null}
      </div>

      {openComment && openAt && visible ? (
        <CommentCard
          comment={openComment}
          replies={comments?.replies[openComment.id] ?? []}
          at={inWindow(onCanvas(openAt.screenId, openAt.spot))}
          onClose={() => comments?.onFocus(null)}
          onReply={comments!.onReply}
          onResolve={comments!.onResolve}
          onDelete={comments!.onDelete}
        />
      ) : null}
      {draft && draftAt && comments ? (
        <Card at={inWindow(onCanvas(draftAt.screenId, draftAt.spot))}>
          <Composer
            key={`${draft.screenId}${draft.anchor.selector}${draft.anchor.x}${draft.anchor.y}`}
            onCancel={() => setDraft(null)}
            onPost={async (text) => {
              if (await comments.onAdd(text, draft.anchor)) setDraft(null);
            }}
          />
        </Card>
      ) : null}

      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <IconButton label="Zoom out" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1 / 1.25)}>
          <span className="text-md leading-none">−</span>
        </IconButton>
        <span className="min-w-12 text-center text-ui font-medium text-foreground-muted">{Math.round(view.scale * 100)}%</span>
        <IconButton label="Zoom in" onClick={() => size && zoomAt(size.width / 2, size.height / 2, 1.25)}>
          <span className="text-md leading-none">+</span>
        </IconButton>
        <IconButton
          label="Fit to the room"
          onClick={() => {
            if (!size) return;
            touched.current = false;
            setView(fitted(size));
          }}
        >
          <FitIcon className="size-[1.125rem]" />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * One screen, live, at the phone's own size and scaled down. The canvas
 * mounts it once its room has settled; it shows in the reveal after that.
 */
function ScreenFrame({
  src,
  device,
  wireframe,
  register,
}: {
  src: string;
  device: Device;
  wireframe: boolean;
  register: (element: HTMLIFrameElement | null) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(0);

  useEffect(() => {
    register(frame.current);
    return () => register(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument;
    return loaded && doc ? applyEmbed(doc) : undefined;
  }, [loaded]);

  // The wireframe look is the studio's own stylesheet in the screen's document, put back each time a document loads.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    return loaded && doc ? applyWireframe(doc, wireframe) : undefined;
  }, [wireframe, loaded]);

  return (
    <iframe
      ref={frame}
      src={src}
      title="Screen"
      tabIndex={-1}
      onLoad={() => setLoaded((count) => count + 1)}
      style={{ width: device.width, height: device.height, transform: `scale(${SCREEN_SCALE})`, filter: wireframe ? WIREFRAME_FRAME_FILTER : undefined }}
      className="pointer-events-none block origin-top-left border-0"
      sandbox="allow-scripts allow-forms allow-same-origin"
    />
  );
}
