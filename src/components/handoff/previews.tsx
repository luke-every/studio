"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";

import { clipOf } from "@/components/prototype/frame-page";
import type { Handoff } from "@/lib/handoff";
import type { Clip, Find } from "@/lib/handoff-clip";
import { DEFAULT_DEVICE, DEVICES } from "@/lib/phone";

import { useLoadSlot } from "./preview-queue";
import { sandboxDocument, SANDBOX_WIDTH } from "./sandbox";
import { list, text, typeInWords, type Candidate, type Prop } from "./words";

/**
 * What a handoff shows of a finding: the real thing, drawn.
 *
 *  - Mine is the element as the prototype draws it: the prototype's page in a frame, found there (see
 *    `handoff-clip.ts`), and only that element shown, scaled to fit.
 *  - A match is the design-system component drawn on its own, in the prototype's theme (see `sandbox.ts`).
 *  - A colour is a swatch.
 *
 * Whatever can't be drawn says so quietly, and never holds the review up.
 */

const DESKTOP = DEVICES.find((device) => device.kind === "desktop")!;
/** How long a page or a component is given to be drawn before it is taken not to be. */
const GIVE_UP_MS = 15000;

function useBox(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return box;
}

/**
 * A frame's page shown only where `clip` says, scaled to fit the room (and up to twice its size, so a tag is legible).
 * Until then the frame is laid out at its own size, unseen, while it loads and is looked in.
 */
function Framed({ clip, view, label, children }: { clip: Clip | null; view: { width: number; height: number }; label: string; children: (style: CSSProperties) => ReactNode }) {
  const room = useRef<HTMLDivElement>(null);
  const box = useBox(room);
  const pad = 24;
  let scale = box ? Math.min(box.width / view.width, box.height / view.height) : 0.1;
  let size = { width: view.width * scale, height: view.height * scale };
  let transform = `scale(${scale})`;
  if (clip && box) {
    scale = Math.max(0.05, Math.min((box.width - pad * 2) / clip.width, (box.height - pad * 2) / clip.height, 2));
    size = { width: clip.width * scale, height: clip.height * scale };
    transform = `scale(${scale}) translate(${-clip.left}px, ${-clip.top}px)`;
  }
  return (
    <div ref={room} role="img" aria-label={label} aria-busy={!clip} className="relative grid size-full place-items-center overflow-hidden">
      <div style={size} className={`relative overflow-hidden ${clip ? "" : "opacity-0"}`}>
        {children({ width: view.width, height: view.height, transform, transformOrigin: "0 0" })}
      </div>
      {clip ? null : <span aria-hidden className="pulse-soft absolute inset-6 rounded-[var(--r-lg)] bg-surface-hover" />}
    </div>
  );
}

const frameClass = "pointer-events-none absolute left-0 top-0 block max-w-none border-0 bg-transparent";

/** Mine: the element in the prototype's page, at a phone's width, else a desktop's, where it may only show there. */
export function PageClip({ src, find, label, fallback, priority }: { src: string; find: Find; label: string; priority: number; /** Shown when the element isn't on the page as it first loads (a sheet or drawer that opens on a tap). */ fallback?: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [clip, setClip] = useState<Clip | "missing" | null>(null);
  const stop = useRef<() => void>(() => {});
  const started = useRef(-1);
  const device = attempt === 0 ? DEFAULT_DEVICE : DESKTOP;
  const { go, done } = useLoadSlot(priority);
  useEffect(() => () => stop.current(), []);
  // The page's place is handed on once the element is found, or it can't be.
  useEffect(() => {
    if (clip) done();
  }, [clip, done]);

  const loaded = (frame: HTMLIFrameElement) => {
    let blank = false;
    try {
      blank = frame.contentWindow?.location.href === "about:blank";
    } catch {
      // On another address (a live version's dev server): loaded, and asked through the bridge.
    }
    if (blank || started.current === attempt) return;
    started.current = attempt;
    stop.current();
    const tried = attempt;
    stop.current = clipOf(frame, find, (found) => {
      if (found) setClip(found);
      else if (tried === 0) setAttempt(1);
      else setClip("missing");
    });
  };

  if (clip === "missing") return fallback ?? <NoPreview />;
  return (
    <Framed clip={clip} view={device} label={label}>
      {(style) => (
        go ? <iframe key={attempt} src={src} title={label} aria-hidden tabIndex={-1} loading="lazy" style={style} onLoad={(event) => loaded(event.currentTarget)} className={frameClass} /> : null
      )}
    </Framed>
  );
}

const isClip = (value: unknown): value is Clip => {
  const clip = value as Clip | null;
  return !!clip && ["left", "top", "width", "height", "viewWidth", "viewHeight"].every((key) => Number.isFinite(clip[key as keyof Clip])) && clip.width > 0 && clip.height > 0;
};

/** A component drawn on its own, with example values: a match, or mine where the page doesn't show it. Its props when it can't be. */
export function ModulePreview({ code, name, props, theme, fontBase, label, priority }: { code: string; name: string; props: Prop[]; theme: Handoff["theme"]; fontBase: string; label: string; priority: number }) {
  const id = useId();
  const { go, done } = useLoadSlot(priority);
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<Clip | "failed" | null>(null);
  const srcDoc = useMemo(() => (code ? sandboxDocument({ module: code, name, props, theme, fontBase, id }) : ""), [code, name, props, theme, fontBase, id]);

  useEffect(() => {
    if (state) done();
  }, [state, done]);

  // Given its place, it has a while to draw: the clock starts then, not while it waits its turn.
  useEffect(() => {
    if (!code || !go) return;
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
  }, [code, id, go]);

  if (!code || state === "failed") return <NoPreview props={props} />;
  return (
    <Framed clip={state} view={{ width: SANDBOX_WIDTH, height: DEFAULT_DEVICE.height }} label={label}>
      {(style) => (go ? <iframe ref={frame} sandbox="allow-scripts" srcDoc={srcDoc} title={label} aria-hidden tabIndex={-1} style={style} className={frameClass} /> : null)}
    </Framed>
  );
}

/** A match: the design-system component drawn on its own. */
export function MatchPreview({ candidate, theme, fontBase, label, priority }: { candidate: Candidate; theme: Handoff["theme"]; fontBase: string; label: string; priority: number }) {
  const props = useMemo(() => list<Prop>(candidate.props), [candidate.props]);
  return <ModulePreview code={text(candidate.module)} name={candidate.name} props={props} theme={theme} fontBase={fontBase} label={label} priority={priority} />;
}

/** Nothing to draw: said quietly, with the component's props when it has some. */
export function NoPreview({ props }: { props?: Prop[] }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 overflow-y-auto p-4 [scrollbar-width:thin]">
      <p className="text-ui text-foreground-subtle">No preview</p>
      {props?.length ? (
        <dl className="grid w-full max-w-xs grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {props.map((prop) => (
            <div key={prop.name} className="contents">
              <dt className="text-foreground">{prop.name}</dt>
              <dd className="min-w-0 truncate text-foreground-muted">{typeInWords(prop.type)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/** `#rrggbb` and an opacity, as a colour a browser can draw. */
export function cssColour(hex: string, alpha = 1) {
  const n = parseInt(hex.slice(1), 16);
  return alpha < 1 ? `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})` : hex;
}

/** A colour, filling its room. The one place a raw colour is drawn: it is what is being judged. */
export function Swatch({ hex, alpha = 1, label, className }: { hex: string; alpha?: number; label: string; className?: string }) {
  return <span role="img" aria-label={label} style={{ backgroundColor: cssColour(hex, alpha) }} className={`block rounded-[var(--r-lg)] border border-border ${className ?? "size-full"}`} />;
}
