"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ExternalIcon, LinkIcon, SlidersIcon } from "@/components/shell/nav-icons";

import { IconButton } from "./button";
import { useStudio } from "@/lib/data/studio-store";

/**
 * A prototype on a tile, the same grey tile the feed uses, 90% of the
 * window tall so all of it is in view. The prototype sits in the middle as
 * a phone, centered on the tile; `leading` (the version) is at the top left and open-in-a-new-tab
 * and copy link at the top right.
 *
 * The prototype loads behind a skeleton, which comes back whenever the url
 * changes, so choosing another version reads as the thing refreshing.
 */
export function PrototypeFrame({
  url,
  title,
  leading,
  controls,
  poster,
}: {
  url?: string;
  title: string;
  /** The version control, at the start of the bar. */
  leading: ReactNode;
  /** What the prototype lets you adjust. Without it there is no button. */
  controls?: ReactNode;
  /** A picture of the prototype, shown while the real one loads. */
  poster?: string;
}) {
  const { notify } = useStudio();
  const [controlsOpen, setControlsOpen] = useState(false);

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
    <div className="relative mx-auto flex h-[var(--frame-height)] min-h-[var(--frame-height)] w-full flex-col rounded-[var(--r-tile)] bg-tile">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:absolute sm:inset-x-0 sm:top-0 sm:z-[var(--z-raised)]">
        <div className="min-w-0 rounded-[var(--r-tag)] bg-surface">{leading}</div>
        {url ? (
          <div className="flex items-center gap-2">
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

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:py-6">
        <div className="relative h-full w-full overflow-hidden rounded-[var(--r-device)] bg-surface sm:w-auto sm:aspect-[9/19.5]">
          {url ? (
            <FrameBody key={url} url={url} title={title} poster={poster} />
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
function FrameBody({ url, title, poster }: { url: string; title: string; poster?: string }) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  // The server-rendered iframe can finish loading before React is listening.
  useEffect(() => {
    if (frame.current?.contentDocument?.readyState === "complete") setLoaded(true);
  }, []);

  return (
    <>
      <iframe
        ref={frame}
        src={url}
        title={title}
        onLoad={() => setLoaded(true)}
        className="size-full border-0"
        // Same-origin now that the studio serves these, so the frame is
        // sandboxed: a prototype can do everything it needs and cannot reach
        // out into the page around it.
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
      />
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
