"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ExternalIcon, LinkIcon, SlidersIcon } from "@/components/shell/nav-icons";

import { IconButton } from "./button";
import { useStudio } from "@/lib/data/studio-store";
import type { Device } from "@/lib/phone";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * A prototype on a tile, the same grey tile the feed uses, 90% of the
 * window tall so all of it is in view. The prototype sits in the middle as
 * a phone, centered on the tile. Along the top: `leading` (the version) on
 * the left, `center` (which phone) in the middle, and the buttons on the right.
 *
 * The prototype is laid out at the phone's own size and then scaled to fit the
 * tile, so it looks the same on a laptop as on a big screen.
 *
 * The prototype loads behind a skeleton, which comes back whenever the url
 * changes, so choosing another version reads as the thing refreshing.
 */
export function PrototypeFrame({
  url,
  title,
  leading,
  center,
  device,
  zoom = 1,
  fit = false,
  controls,
  poster,
}: {
  url?: string;
  title: string;
  /** The version control, at the start of the bar. */
  leading: ReactNode;
  /** The phone picker and sizing, in the middle of the bar. Told the scale the preview is drawn at. */
  center?: (info: { scale: number | null }) => ReactNode;
  /** The phone it is laid out for. */
  device: Device;
  /** How big to draw it, as a multiple of the phone's real size; 1 is its exact size. */
  zoom?: number;
  /** Scale it to the room there is instead; `zoom` is ignored while this is on. */
  fit?: boolean;
  /** What the prototype lets you adjust. Without it there is no button. */
  controls?: ReactNode;
  /** A picture of the prototype, shown while the real one loads. */
  poster?: string;
}) {
  const { notify } = useStudio();
  const [controlsOpen, setControlsOpen] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  // On a phone it is a preview, not a place to work: always scaled to fit the
  // screen, with no picking a size.
  const narrow = useMediaQuery("(max-width: 639px)");
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSpace({ width, height });
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);
  // Measured on the client only, so no frame is drawn on the server.
  const scale = space
    ? fit || narrow
      ? Math.min(space.width / device.width, space.height / device.height)
      : zoom
    : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
      notify("Link copied to clipboard");
    } catch {
      // Clipboard blocked: say nothing rather than claim a copy that didn't happen.
    }
  };

  return (
    <div
      className={`relative mx-auto flex min-h-[var(--frame-height)] w-full flex-col rounded-[var(--r-tile)] bg-tile max-sm:h-[var(--frame-height)] max-sm:rounded-none ${
        // Scaled to fit, the tile is a set height and the phone is made to fit
        // it. Otherwise the tile is at least that tall and grows to hold a
        // phone that is taller. On a phone it is always the set height.
        fit ? "sm:h-[var(--frame-height)]" : ""
      }`}
    >
      <div className="grid min-h-16 grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:absolute sm:inset-x-0 sm:top-0 sm:z-[var(--z-raised)]">
        <div className="min-w-0 justify-self-start rounded-[var(--r-tag)] bg-surface">{leading}</div>
        {/* Picking a phone makes no sense on a phone. */}
        <div className="hidden justify-self-center sm:block">{center?.({ scale })}</div>
        {url ? (
          <div className="flex items-center gap-2 [grid-column:3] justify-self-end">
            {controls ? (
              <IconButton
                label="Controls"
                tooltipAlign="end"
                onClick={() => setControlsOpen((open) => !open)}
                aria-expanded={controlsOpen}
                className={controlsOpen ? "!border-transparent !bg-accent !text-accent-foreground" : ""}
              >
                <SlidersIcon className="size-[1.125rem]" />
              </IconButton>
            ) : null}
            <IconButton label="Open in a new tab" href={url} external tooltipAlign="end">
              <ExternalIcon className="size-[1.125rem]" />
            </IconButton>
            <IconButton label="Copy link" onClick={copy} tooltipAlign="end">
              <LinkIcon className="size-[1.125rem]" />
            </IconButton>
          </div>
        ) : null}
      </div>

      <div ref={stage} className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 [scrollbar-width:thin] sm:py-16">
        <div
          style={scale ? { width: device.width * scale, height: device.height * scale } : { aspectRatio: `${device.width} / ${device.height}` }}
          className={`relative isolate m-auto shrink-0 overflow-hidden rounded-[var(--r-device)] bg-surface [transform:translateZ(0)] ${
            scale ? "" : "h-full"
          }`}
        >
          {url ? (
            <FrameBody key={url} url={url} title={title} poster={poster} scale={scale} device={device} />
          ) : (
            <div className="grid size-full place-items-center">
              <p className="max-w-[30ch] px-6 text-center text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
                No files for this version. Push one from Claude Code with{" "}
                <span className="text-foreground-muted">/push</span>.
              </p>
            </div>
          )}
        </div>
      </div>

      {controls && controlsOpen ? (
        <div
          className="absolute right-4 top-[4.5rem] max-h-[calc(100%-6rem)] w-72 overflow-y-auto rounded-[var(--r-xl)] bg-surface p-4"
          style={{ zIndex: "var(--z-raised)" }}
        >
          {controls}
        </div>
      ) : null}
    </div>
  );
}

/** Remounted per url, so every version starts from the skeleton. */
function FrameBody({
  url,
  title,
  poster,
  scale,
  device,
}: {
  url: string;
  title: string;
  poster?: string;
  scale: number | null;
  device: Device;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  // The server-rendered iframe can finish loading before React is listening.
  useEffect(() => {
    if (frame.current?.contentDocument?.readyState === "complete") setLoaded(true);
  }, []);

  return (
    <>
      {scale ? (
      <iframe
        ref={frame}
        src={url}
        title={title}
        onLoad={() => setLoaded(true)}
        style={{ width: device.width, height: device.height, transform: `scale(${scale})` }}
        className="origin-top-left border-0"
        // Same-origin now that the studio serves these, so the frame is
        // sandboxed: a prototype can do everything it needs and cannot reach
        // out into the page around it.
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      />
      ) : null}
      {loaded ? null : poster && !posterFailed ? (
        // The same picture the tile shows, so the page looks right at once and
        // the real prototype replaces it without a flash. It breathes while
        // the prototype loads, so it doesn't look frozen.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          draggable={false}
          onError={() => setPosterFailed(true)}
          className="pulse-soft absolute inset-0 size-full bg-surface object-cover object-top"
        />
      ) : (
        <div aria-hidden className="pulse-soft absolute inset-0 bg-surface" />
      )}
    </>
  );
}
