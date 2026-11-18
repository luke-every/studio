"use client";

import { createContext, memo, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore, type Ref } from "react";

import { CanvasCamera, zoomAbout, type View } from "@/lib/canvas-camera";
import { captureFrom, type Check, type Snapshot } from "@/lib/dom-snapshot";

/**
 * Many screens on a canvas, drawn three ways with the same camera and the same layout, so what each costs can be measured
 * instead of guessed:
 *
 *  - Today: one live iframe per screen; the view is React state, re-rendering everything on each step.
 *  - Camera: the same live iframes, but the view lives in a CanvasCamera that writes one transform per frame.
 *  - DOM: the page is read once into static DOM (see lib/dom-snapshot.ts) and shown N times in this one document, each in
 *    its own shadow root: Paper's shape, no per-screen runtime.
 *
 * "Cull offscreen" hides screens a viewport or more away (revealing them again half a viewport away, so the edge doesn't
 * flicker), which also tells us whether hiding an iframe helps. "Run test" pans and zooms along a fixed path and reports
 * frame times. "Compare look" puts the live page beside its static copy.
 */

const DEVICE = { width: 390, height: 844 };
const SCALE = 0.5;
const FRAME = { width: DEVICE.width * SCALE, height: DEVICE.height * SCALE };
const GAP = { x: 48, y: 72 };
const LIMITS = { min: 0.08, max: 4 };
const COUNTS = [1, 5, 10, 25, 50];
const TEST_MS = 6000;

type Mode = "today" | "camera" | "dom" | "domreact";
type Kind = "zoom" | "pan";
type Place = { x: number; y: number; name: string };
type Stats = { frames: number; fps: number; p50: number; p95: number; max: number; late: number; loadMs: number | null };
type Driver = { set: (view: View) => void; get: () => View };
type Register = (name: string, element: HTMLElement | null) => void;
/** How screens outside the window are dealt with: left alone, hidden, or (an iframe only) unloaded until they come near. */
type Cull = "off" | "hide" | "unload";
/** What is done while the zoom is changing: nothing, drop the expensive effects, hold the drawn pixels, or both. */
type ZoomMode = "off" | "cheap" | "hold" | "both";
type Run = { mode: Mode; cull: Cull; zoom: ZoomMode };

/** How a screen tells the camera's culling which element is it. */
const Registry = createContext<Register>(() => {});
/** The small layer the camera publishes the scale on. It holds the labels and arrows, never the screens. */
const Vars = createContext<React.RefObject<HTMLDivElement | null> | null>(null);

const labelOf = ({ mode, cull, zoom }: Run) => (mode === "today" ? "Today" : mode === "domreact" ? "DOM + React view" : `${mode === "camera" ? "Camera" : "DOM"}${cull === "hide" ? " + cull" : cull === "unload" ? " + unload" : ""}${zoom === "off" ? "" : ` + ${zoom}`}`);

const placesOf = (count: number): Place[] => {
  const columns = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, index) => ({
    x: (index % columns) * (FRAME.width + GAP.x),
    y: Math.floor(index / columns) * (FRAME.height + GAP.y),
    name: `Screen ${index + 1}`,
  }));
};

/** Everything in the window, with a margin. */
const fitted = (places: Place[]): View => {
  const width = Math.max(...places.map((place) => place.x)) + FRAME.width;
  const height = Math.max(...places.map((place) => place.y)) + FRAME.height;
  const scale = Math.min(1, (window.innerWidth * 0.9) / width, (window.innerHeight * 0.9) / height);
  return { scale, x: (window.innerWidth - width * scale) / 2, y: (window.innerHeight - height * scale) / 2 };
};

/** One arrow from each screen to the next: out of the right edge, or down to the next row. */
const arrowsOf = (places: Place[]) =>
  places.slice(0, -1).map((from, index) => {
    const to = places[index + 1];
    if (to.x > from.x) {
      const a = { x: from.x + FRAME.width, y: from.y + FRAME.height / 2 };
      const b = { x: to.x, y: to.y + FRAME.height / 2 };
      return { a, b, reach: Math.abs(b.x - a.x) / 2, down: false };
    }
    const a = { x: from.x + FRAME.width / 2, y: from.y + FRAME.height };
    const b = { x: to.x + FRAME.width / 2, y: to.y };
    return { a, b, reach: Math.abs(b.y - a.y) / 2, down: true };
  });

const pathOf = (arrow: ReturnType<typeof arrowsOf>[number], at: (point: { x: number; y: number }) => { x: number; y: number }) => {
  const a = at(arrow.a);
  const b = at(arrow.b);
  return arrow.down ? `M${a.x},${a.y} C${a.x},${a.y + arrow.reach} ${b.x},${b.y - arrow.reach} ${b.x},${b.y}` : `M${a.x},${a.y} C${a.x + arrow.reach},${a.y} ${b.x - arrow.reach},${b.y} ${b.x},${b.y}`;
};

/** Scroll or drag pans, ⌘-scroll or pinch zooms, on the element. */
function useInput(element: React.RefObject<HTMLDivElement | null>, handlers: { pan: (dx: number, dy: number) => void; zoom: (px: number, py: number, factor: number) => void }) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = target.getBoundingClientRect();
        latest.current.zoom(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.01));
      } else latest.current.pan(-event.deltaX, -event.deltaY);
    };
    let pinched = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      pinched = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale: number; clientX?: number; clientY?: number };
      const rect = target.getBoundingClientRect();
      latest.current.zoom((gesture.clientX ?? rect.left + rect.width / 2) - rect.left, (gesture.clientY ?? rect.top + rect.height / 2) - rect.top, gesture.scale / pinched);
      pinched = gesture.scale;
    };
    let drag: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => {
      drag = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (!drag) return;
      latest.current.pan(event.clientX - drag.x, event.clientY - drag.y);
      drag = { x: event.clientX, y: event.clientY };
    };
    const onUp = () => {
      drag = null;
    };
    target.addEventListener("wheel", onWheel, { passive: false });
    target.addEventListener("gesturestart", onGestureStart);
    target.addEventListener("gesturechange", onGestureChange);
    target.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      target.removeEventListener("wheel", onWheel);
      target.removeEventListener("gesturestart", onGestureStart);
      target.removeEventListener("gesturechange", onGestureChange);
      target.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [element]);
}

/** A live page, drawn at a phone's size and scaled down, like a screen on the canvas. */
function Screen({ place, src, onLoaded, register }: { place: Place; src: string; onLoaded: () => void; register?: Register }) {
  return (
    <div ref={(element) => register?.(place.name, element)} style={{ left: place.x, top: place.y, width: FRAME.width, height: FRAME.height }} className="absolute overflow-hidden rounded-[calc(var(--r-device)*0.5)] bg-surface">
      <iframe
        src={src}
        title={place.name}
        tabIndex={-1}
        inert
        sandbox="allow-scripts allow-same-origin allow-forms"
        onLoad={onLoaded}
        style={{ width: DEVICE.width, height: DEVICE.height, transform: `scale(${SCALE})` }}
        className="pointer-events-none block origin-top-left border-0"
      />
    </div>
  );
}

/** A page's copy as a template. While the zoom is changing (the host says so), the effects that cost the most to redraw are off, as Paper does. */
const copyTemplate = (html: string) => {
  const made = document.createElement("template");
  made.innerHTML = `<style>:host([data-zooming]) *{filter:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;text-shadow:none!important}</style>${html}`;
  return made;
};

/** A page's static copy, in a shadow root so the studio's own styles can't touch it. */
function Copy({ template, background, scale = SCALE, height = DEVICE.height }: { template: HTMLTemplateElement; background: string; scale?: number; height?: number }) {
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host || host.shadowRoot) return;
      host.attachShadow({ mode: "open" }).appendChild(template.content.cloneNode(true));
    },
    [template],
  );
  return <div ref={attach} data-copy="" style={{ width: DEVICE.width, height, background, transform: `scale(${scale})`, transformOrigin: "top left", overflow: "clip", contain: "content" }} />;
}

/** The names and arrows, in the world's own units, so they move with the camera and need no React for it. */
function Marks({ places }: { places: Place[] }) {
  const vars = useContext(Vars);
  return (
    <div ref={vars} className="pointer-events-none absolute left-0 top-0">
      <svg aria-hidden width={1} height={1} className="pointer-events-none absolute left-0 top-0 overflow-visible text-foreground-subtle">
        {arrowsOf(places).map((arrow, index) => (
          <path key={index} d={pathOf(arrow, (point) => point)} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {places.map((place) => (
        // Dividing out the zoom keeps the name one size on screen.
        <span key={`${place.name}-name`} style={{ left: place.x, top: place.y - 4, transform: "translateY(-100%) scale(calc(1 / var(--cam-s)))", transformOrigin: "left bottom", maxWidth: FRAME.width }} className="pointer-events-none absolute truncate text-xs font-medium text-foreground-muted">
          {place.name}
        </span>
      ))}
    </div>
  );
}

const World = memo(function World({ places, src, onLoaded }: { places: Place[]; src: string; onLoaded: () => void }) {
  const register = useContext(Registry);
  return (
    <>
      {places.map((place) => (
        <Screen key={place.name} place={place} src={src} onLoaded={onLoaded} register={register} />
      ))}
      <Marks places={places} />
    </>
  );
});

/** The same layout with the page as static DOM, once per screen, all in this document. */
const DomWorld = memo(function DomWorld({ places, snapshot }: { places: Place[]; snapshot: Snapshot }) {
  const register = useContext(Registry);
  const template = useMemo(() => copyTemplate(snapshot.html), [snapshot]);
  // Fonts belong to the document, so the shadow roots draw with them.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = snapshot.fonts;
    document.head.appendChild(style);
    return () => style.remove();
  }, [snapshot]);
  return (
    <>
      {places.map((place) => (
        <div key={place.name} ref={(element) => register(place.name, element)} style={{ left: place.x, top: place.y, width: FRAME.width, height: FRAME.height, contain: "content" }} className="absolute overflow-clip rounded-[calc(var(--r-device)*0.5)] bg-surface">
          <Copy template={template} background={snapshot.background} />
        </div>
      ))}
      <Marks places={places} />
    </>
  );
});

const dots = "radial-gradient(var(--border) 1px, transparent 1px)";

/** Today's way: the view is React state, and everything that depends on it is worked out again on each step. */
function TodayCanvas({ places, src, snapshot, driver, onLoaded }: { places: Place[]; src: string; snapshot: Snapshot | null; driver: Ref<Driver>; onLoaded: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const template = useMemo(() => (snapshot ? copyTemplate(snapshot.html) : null), [snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    const style = document.createElement("style");
    style.textContent = snapshot.fonts;
    document.head.appendChild(style);
    return () => style.remove();
  }, [snapshot]);
  const [view, setView] = useState<View>(() => fitted(places));
  const now = useRef(view);
  useEffect(() => {
    now.current = view;
  });
  useImperativeHandle(driver, () => ({ set: setView, get: () => now.current }), []);
  useInput(box, {
    pan: (dx, dy) => setView((was) => ({ ...was, x: was.x + dx, y: was.y + dy })),
    zoom: (px, py, factor) => setView((was) => zoomAbout(was, px, py, factor, LIMITS)),
  });
  const toScreen = (point: { x: number; y: number }) => ({ x: view.x + point.x * view.scale, y: view.y + point.y * view.scale });
  return (
    <div ref={box} style={{ backgroundImage: dots, backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px` }} className="absolute inset-0 touch-none overflow-hidden">
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {places.map((place) =>
          template && snapshot ? (
            // Not memoised, on purpose: it is drawn again on every step, as the real canvas draws its screens.
            <div key={place.name} style={{ left: place.x, top: place.y, width: FRAME.width, height: FRAME.height, contain: "content" }} className="absolute overflow-clip rounded-[calc(var(--r-device)*0.5)] bg-surface">
              <Copy template={template} background={snapshot.background} />
            </div>
          ) : (
            <Screen key={place.name} place={place} src={src} onLoaded={() => onLoaded()} />
          ),
        )}
      </div>
      <svg aria-hidden className="pointer-events-none absolute inset-0 size-full text-foreground-subtle">
        {arrowsOf(places).map((arrow, index) => (
          <path key={index} d={pathOf(arrow, toScreen)} fill="none" stroke="currentColor" strokeWidth={1.5} />
        ))}
      </svg>
      {places.map((place) => {
        const spot = toScreen(place);
        return (
          <span key={place.name} style={{ left: spot.x, top: spot.y - 22, maxWidth: Math.max(60, FRAME.width * view.scale) }} className="pointer-events-none absolute truncate text-xs font-medium text-foreground-muted">
            {place.name}
          </span>
        );
      })}
    </div>
  );
}

const meets = (a: { minX: number; minY: number; maxX: number; maxY: number }, b: { minX: number; minY: number; maxX: number; maxY: number }) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

/** Hides screens a viewport or more from the window and brings them back half a viewport away, by position alone. */
function useCulling(camera: CanvasCamera, places: Place[], elements: React.RefObject<Map<string, HTMLElement>>, cull: Cull) {
  useEffect(() => {
    if (cull === "off") return;
    const culled = new Set<string>();
    const show = (name: string, visible: boolean) => {
      const element = elements.current.get(name);
      if (!element) return;
      // An iframe that is only hidden still runs and still costs; unloading it is what frees it.
      const frame = cull === "unload" ? element.querySelector("iframe") : null;
      if (frame) {
        if (!visible) {
          frame.dataset.src = frame.getAttribute("src") ?? "";
          frame.src = "about:blank";
        } else if (frame.dataset.src) frame.src = frame.dataset.src;
      } else element.style.visibility = visible ? "" : "hidden";
    };
    const check = (view: View) => {
      const width = window.innerWidth / view.scale;
      const height = window.innerHeight / view.scale;
      const window_ = { minX: -view.x / view.scale, minY: -view.y / view.scale, maxX: -view.x / view.scale + width, maxY: -view.y / view.scale + height };
      const grown = (margin: number) => ({ minX: window_.minX - width * margin, minY: window_.minY - height * margin, maxX: window_.maxX + width * margin, maxY: window_.maxY + height * margin });
      const reveal = grown(0.5);
      const cull = grown(1);
      for (const place of places) {
        const box = { minX: place.x, minY: place.y, maxX: place.x + FRAME.width, maxY: place.y + FRAME.height };
        if (culled.has(place.name)) {
          if (meets(reveal, box)) {
            culled.delete(place.name);
            show(place.name, true);
          }
        } else if (!meets(cull, box)) {
          culled.add(place.name);
          show(place.name, false);
        }
      }
    };
    const stop = camera.subscribeFrame(check);
    check(camera.current);
    return () => {
      stop();
      for (const name of culled) show(name, true);
    };
  }, [camera, places, elements, cull]);
}

/** While the scale is changing (and for a moment after), does what `zoom` says; restores everything when it settles. */
function useZooming(camera: CanvasCamera, world: React.RefObject<HTMLDivElement | null>, zoom: ZoomMode) {
  useEffect(() => {
    const target = world.current;
    if (zoom === "off" || !target) return;
    let last = camera.current.scale;
    let timer = 0;
    let active = false;
    const set = (next: boolean) => {
      if (next === active) return;
      active = next;
      // Hold: the browser scales the pixels it already drew instead of drawing every step again, and draws once when it stops.
      if (zoom === "hold" || zoom === "both") target.style.willChange = next ? "transform" : "";
      if (zoom === "cheap" || zoom === "both") for (const host of Array.from(target.querySelectorAll("[data-copy]"))) host.toggleAttribute("data-zooming", next);
    };
    const stop = camera.subscribeFrame((view) => {
      if (view.scale === last) return;
      last = view.scale;
      set(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => set(false), 180);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
      set(false);
    };
  }, [camera, world, zoom]);
}

/** The camera's way: the view lives outside React and is written once per frame. What goes in the world is its children. */
function CameraCanvas({ places, driver, cull, zoom, children }: { places: Place[]; driver: Ref<Driver>; cull: Cull; zoom: ZoomMode; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());
  const marks = useRef<HTMLDivElement>(null);
  const register = useCallback<Register>((name, element) => {
    if (element) elements.current.set(name, element);
    else elements.current.delete(name);
  }, []);
  const camera = useMemo(() => new CanvasCamera(fitted(places), { limits: LIMITS }), [places]);
  useEffect(() => {
    camera.attach({ world: world.current, vars: marks.current, grid: box.current, gridStep: 24 }, Math.max(window.innerWidth, window.innerHeight));
    return () => camera.dispose();
  }, [camera]);
  useImperativeHandle(driver, () => ({ set: (view) => camera.set(view), get: () => camera.current }), [camera]);
  useInput(box, { pan: (dx, dy) => camera.panBy(dx, dy), zoom: (px, py, factor) => camera.zoomAt(px, py, factor) });
  useCulling(camera, places, elements, cull);
  useZooming(camera, world, zoom);
  return (
    <div ref={box} style={{ backgroundImage: dots }} className="absolute inset-0 touch-none overflow-hidden">
      <div ref={world} className="absolute left-0 top-0 origin-top-left">
        <Vars.Provider value={marks}>
          <Registry.Provider value={register}>{children}</Registry.Provider>
        </Vars.Provider>
      </div>
    </div>
  );
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Pans (and, for `zoom`, zooms) along a fixed path and records how long each frame took to arrive. */
function measure(driver: Driver, kind: Kind, duration: number): Promise<Omit<Stats, "loadMs">> {
  return new Promise((resolve) => {
    const base = driver.get();
    const deltas: number[] = [];
    let last = 0;
    let start = 0;
    const step = (time: number) => {
      start ||= time;
      if (last) deltas.push(time - last);
      last = time;
      const elapsed = time - start;
      if (elapsed >= duration) {
        const sorted = [...deltas].sort((a, b) => a - b);
        const at = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0;
        resolve({ frames: deltas.length, fps: 1000 / (deltas.reduce((sum, delta) => sum + delta, 0) / Math.max(deltas.length, 1)), p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0, late: deltas.filter((delta) => delta > 33.4).length });
        return;
      }
      const scale = kind === "zoom" ? Math.min(LIMITS.max, Math.max(LIMITS.min, base.scale * (1 + 0.6 * Math.sin(elapsed / 1100)))) : base.scale;
      driver.set({ scale, x: base.x + 220 * Math.sin(elapsed / 650), y: base.y + 140 * Math.cos(elapsed / 800) });
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** The live page beside its static copy, at the size it is drawn on a phone, to judge by eye. */
function LookView({ src, snapshot, onClose }: { src: string; snapshot: Snapshot; onClose: () => void }) {
  const template = useMemo(() => {
    const made = document.createElement("template");
    made.innerHTML = snapshot.html;
    return made;
  }, [snapshot]);
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = snapshot.fonts;
    document.head.appendChild(style);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      style.remove();
      window.removeEventListener("keydown", onKey);
    };
  }, [snapshot, onClose]);
  return (
    <div className="absolute inset-0 z-[var(--z-modal)] flex items-start justify-center gap-8 overflow-auto bg-surface/95 p-8">
      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs text-foreground-muted">Live page</figcaption>
        <iframe src={src} title="Live page" sandbox="allow-scripts allow-same-origin allow-forms" style={{ width: DEVICE.width, height: DEVICE.height }} className="rounded-[var(--r-device)] border border-border" />
      </figure>
      <figure className="flex flex-col gap-2">
        <figcaption className="text-xs text-foreground-muted">Static copy</figcaption>
        {/* The whole page, scrolled inside a phone's height like the live one beside it. */}
        <div style={{ width: DEVICE.width, height: DEVICE.height }} className="overflow-y-auto overflow-x-hidden rounded-[var(--r-device)] border border-border [scrollbar-width:none]">
          <Copy template={template} background={snapshot.background} scale={1} height={snapshot.height} />
        </div>
      </figure>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 h-7 rounded-[var(--r-full)] border border-border bg-surface px-3 text-xs text-foreground hover:bg-surface-hover">
        Close
      </button>
    </div>
  );
}

const button = "h-7 rounded-[var(--r-full)] border border-border px-3 text-xs text-foreground transition-colors hover:bg-surface-hover disabled:opacity-40";
const on = "bg-surface-inset";
const never = () => () => {};

/** What to paste back when a copy isn't right: how much matches, and the shallowest elements that don't. */
const reportOf = (check: Check) =>
  [
    `${check.elements} elements; ${check.sameBoxes} in the same box (${Math.round((100 * check.sameBoxes) / Math.max(check.elements, 1))}%); same path ${check.selectors.same} of ${check.selectors.checked}`,
    ...check.worst.map((item) => `${item.tag}${item.id ? `#${item.id}` : ""} "${item.text}" live [${item.live.join(", ")}] copy [${item.copy.join(", ")}] ${item.selector}`),
    ...check.differentSelectors.map((item) => `path differs: ${item.live}  !=  ${item.copy}`),
  ].join("\n");

export function BenchClient() {
  // Client only, and the page asked for in the frames comes from the address: read as an external store, so the page needs no server round trip.
  const ready = useSyncExternalStore(never, () => true, () => false);
  const asked = useSyncExternalStore(never, () => new URLSearchParams(window.location.search).get("src"), () => null);
  const [typed, setTyped] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const address = typed ?? asked ?? "/";
  const src = chosen ?? asked ?? "/";
  const [mode, setMode] = useState<Mode>("camera");
  const [cull, setCull] = useState<Cull>("off");
  const [zoom, setZoom] = useState<ZoomMode>("off");
  const [kind, setKind] = useState<Kind>("zoom");
  const [count, setCount] = useState(10);
  const [loaded, setLoaded] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Stats>>({});
  const [heap, setHeap] = useState<string | null>(null);
  const [copy, setCopy] = useState<{ src: string; snapshot: Snapshot } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const driver = useRef<Driver>(null);
  const mounted = useRef(0);
  const loadedAt = useRef<{ count: number; done: (ms: number) => void; start: number } | null>(null);
  const places = useMemo(() => placesOf(count), [count]);
  const snapshot = copy?.src === src ? copy.snapshot : null;

  // Stable, so the camera's world (which never re-renders for the view) doesn't re-render for this either.
  const frameLoaded = useCallback(() => {
    setLoaded((now) => now + 1);
    mounted.current += 1;
    const waiting = loadedAt.current;
    if (waiting && mounted.current >= waiting.count) {
      loadedAt.current = null;
      waiting.done(performance.now() - waiting.start);
    }
  }, []);

  const reset = () => {
    mounted.current = 0;
    setLoaded(0);
  };

  /** Starts counting loads for the canvas that was just mounted; resolves with how long all of them took, or null if they didn't. */
  const allLoaded = () =>
    new Promise<number | null>((resolve) => {
      const start = performance.now();
      loadedAt.current = { count, done: resolve, start };
      setTimeout(() => {
        if (loadedAt.current) {
          loadedAt.current = null;
          resolve(null);
        }
      }, 25000);
    });

  const capture = async () => {
    setCapturing(true);
    setProblem(null);
    try {
      const made = await captureFrom(src, DEVICE, { check: true });
      setCopy({ src, snapshot: made });
      return made;
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Couldn't read the page.");
      return null;
    } finally {
      setCapturing(false);
    }
  };

  const readHeap = () => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    setHeap(memory ? `${(memory.usedJSHeapSize / 1048576).toFixed(0)} MB (this page only, not the frames)` : null);
  };

  const run = async (which: Run[]) => {
    let current = mode;
    for (const next of which) {
      if ((next.mode === "dom" || next.mode === "domreact") && !snapshot && !(await capture())) break;
      let loadMs: number | null = null;
      if (next.mode !== current) {
        // Switching mounts a new canvas, so its screens start from nothing: that is the cold-start cost too.
        setRunning(`${labelOf(next)}: loading ${count} screens`);
        current = next.mode;
        reset();
        const waiting = next.mode === "dom" || next.mode === "domreact" ? null : allLoaded();
        setMode(next.mode);
        loadMs = waiting ? await waiting : null;
      }
      setCull(next.cull);
      setZoom(next.zoom);
      await sleep(800);
      setRunning(`${labelOf(next)}: measuring`);
      if (!driver.current) break;
      const stats = await measure(driver.current, kind, TEST_MS);
      setResults((now) => ({ ...now, [labelOf(next)]: { ...stats, loadMs } }));
      readHeap();
    }
    setRunning(null);
  };

  if (!ready) return null;
  const busy = !!running || capturing;
  const canvasKey = `${mode}-${count}-${src}`;
  return (
    <div className="fixed inset-0 bg-tile">
      {mode === "today" || mode === "domreact" ? (
        mode === "domreact" && !snapshot ? null : <TodayCanvas key={canvasKey} places={places} src={src} snapshot={mode === "domreact" ? snapshot : null} driver={driver} onLoaded={frameLoaded} />
      ) : mode === "dom" && !snapshot ? null : (
        <CameraCanvas key={canvasKey} places={places} driver={driver} cull={cull} zoom={zoom}>
          {mode === "dom" && snapshot ? <DomWorld places={places} snapshot={snapshot} /> : <World places={places} src={src} onLoaded={frameLoaded} />}
        </CameraCanvas>
      )}
      <div className="absolute left-4 top-4 z-[var(--z-raised)] flex max-h-[calc(100dvh-2rem)] w-96 flex-col gap-3 overflow-y-auto rounded-[var(--r-control)] border border-border bg-surface p-4 text-xs text-foreground shadow-[var(--elev-overlay)]">
        <div className="flex items-baseline justify-between">
          <h1 className="text-sm font-medium">Canvas bench</h1>
          <span className="text-foreground-muted">{mode === "dom" || mode === "domreact" ? `${snapshot ? count : 0} copies` : `${loaded} / ${count} loaded`}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["today", "camera", "dom", "domreact"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`${button} ${mode === value ? on : ""}`}
              disabled={busy}
              onClick={() => {
                reset();
                setMode(value);
                if (value === "today" || value === "domreact") {
                  setCull("off");
                  setZoom("off");
                }
              }}
            >
              {value === "today" ? "Today" : value === "camera" ? "Camera" : value === "dom" ? "DOM" : "DOM + React view"}
            </button>
          ))}
          <button type="button" aria-pressed={cull !== "off"} className={`${button} ${cull !== "off" ? on : ""}`} disabled={busy || mode === "today" || mode === "domreact"} onClick={() => setCull((now) => (now === "off" ? "hide" : now === "hide" && mode === "camera" ? "unload" : "off"))}>
            Offscreen: {cull === "off" ? "kept" : cull === "hide" ? "hidden" : "unloaded"}
          </button>
          <button type="button" aria-pressed={zoom !== "off"} className={`${button} ${zoom !== "off" ? on : ""}`} disabled={busy || mode === "today" || mode === "domreact"} onClick={() => setZoom((now) => (now === "off" ? "cheap" : now === "cheap" ? "hold" : now === "hold" ? "both" : "off"))}>
            Zooming: {zoom === "off" ? "plain" : zoom === "cheap" ? "cheap" : zoom === "hold" ? "hold pixels" : "cheap + hold"}
          </button>
          <button type="button" aria-pressed={kind === "pan"} className={`${button} ${kind === "pan" ? on : ""}`} disabled={busy} onClick={() => setKind((now) => (now === "zoom" ? "pan" : "zoom"))}>
            {kind === "zoom" ? "Zoom + pan" : "Pan only"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${button} ${count === value ? on : ""}`}
              disabled={busy}
              onClick={() => {
                reset();
                setCount(value);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            reset();
            setChosen(address.trim() || "/");
          }}
        >
          <input aria-label="Page in each frame" value={address} onChange={(event) => setTyped(event.target.value)} className="h-7 min-w-0 flex-1 rounded-[var(--r-md)] border border-border bg-surface px-2 text-xs outline-none focus-visible:border-foreground-subtle" />
          <button type="submit" className={button} disabled={busy}>
            Load
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void capture()}>
            {capturing ? "Reading the page…" : snapshot ? "Read again" : "Read page"}
          </button>
          <button type="button" className={button} disabled={busy || !snapshot} onClick={() => setLooking(true)}>
            Compare look
          </button>
          {snapshot ? (
            <span className="text-foreground-muted">
              {snapshot.nodes.toLocaleString()} nodes · {(snapshot.html.length / 1024).toFixed(0)} KB · {snapshot.ms.toFixed(0)} ms{snapshot.truncated ? " · cut short" : ""}
            </span>
          ) : null}
        </div>
        {snapshot?.check ? (
          <details className="text-foreground-muted">
            <summary className="cursor-pointer text-foreground">
              Same box {Math.round((100 * snapshot.check.sameBoxes) / Math.max(snapshot.check.elements, 1))}% · same path {snapshot.check.selectors.same} of {snapshot.check.selectors.checked}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-all text-xs">{reportOf(snapshot.check)}</pre>
          </details>
        ) : null}
        {problem ? <p className="text-destructive">{problem}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={() => void run([{ mode, cull, zoom }])}>
            Run test
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() =>
              void run([
                { mode: "today", cull: "off", zoom: "off" },
                { mode: "camera", cull: "off", zoom: "off" },
                { mode: "camera", cull: "hide", zoom: "off" },
                { mode: "camera", cull: "unload", zoom: "off" },
                { mode: "camera", cull: "off", zoom: "hold" },
                { mode: "dom", cull: "off", zoom: "off" },
                { mode: "domreact", cull: "off", zoom: "off" },
                { mode: "dom", cull: "hide", zoom: "off" },
                { mode: "dom", cull: "hide", zoom: "cheap" },
                { mode: "dom", cull: "hide", zoom: "hold" },
                { mode: "dom", cull: "hide", zoom: "both" },
              ])
            }
          >
            Compare all
          </button>
        </div>
        {running ? <p className="text-foreground-muted">{running}…</p> : null}
        {Object.keys(results).length ? (
          <table className="w-full border-collapse text-left tabular-nums">
            <thead className="text-foreground-muted">
              <tr>
                <th className="pb-1 font-normal" />
                <th className="pb-1 font-normal">fps</th>
                <th className="pb-1 font-normal">p95 ms</th>
                <th className="pb-1 font-normal">worst</th>
                <th className="pb-1 font-normal">late</th>
                <th className="pb-1 font-normal">load s</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(results).map(([label, stats]) => {
                return (
                  <tr key={label} className="border-t border-border">
                    <td className="py-1 pr-2">{label}</td>
                    <td>{stats.fps.toFixed(0)}</td>
                    <td>{stats.p95.toFixed(1)}</td>
                    <td>{stats.max.toFixed(0)}</td>
                    <td>{stats.late}</td>
                    <td>{stats.loadMs === null ? "—" : (stats.loadMs / 1000).toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        {heap ? <p className="text-foreground-muted">JS heap: {heap}</p> : null}
      </div>
      {looking && snapshot ? <LookView src={src} snapshot={snapshot} onClose={() => setLooking(false)} /> : null}
    </div>
  );
}
