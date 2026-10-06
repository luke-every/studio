"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { ExternalIcon, LinkIcon } from "@/components/shell/nav-icons";

import { Toast, useToast } from "./toast";

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
}: {
  url?: string;
  title: string;
  /** The version control, at the start of the bar. */
  leading: ReactNode;
}) {
  const toast = useToast();

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).href);
      toast.show();
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
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in a new tab"
              title="Open in a new tab"
              className={iconButton}
            >
              <ExternalIcon className="size-[1.125rem]" />
            </a>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy link"
              title="Copy link"
              className={iconButton}
            >
              <LinkIcon className="size-[1.125rem]" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:py-6">
        <div className="relative h-full w-full overflow-hidden rounded-[var(--r-device)] bg-surface sm:w-auto sm:aspect-[9/19.5]">
          {url ? (
            <FrameBody key={url} url={url} title={title} />
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

      <Toast state={toast.state} onDone={toast.done}>
        Link copied to clipboard
      </Toast>
    </div>
  );
}

/** Remounted per url, so every version starts from the skeleton. */
function FrameBody({ url, title }: { url: string; title: string }) {
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
      {loaded ? null : (
        <div aria-hidden className="absolute inset-0 flex animate-pulse flex-col gap-4 bg-surface p-5">
          <div className="h-8 w-2/5 rounded-[var(--r-lg)] bg-tile" />
          <div className="h-40 rounded-[var(--r-xl)] bg-tile" />
          <div className="h-4 w-4/5 rounded-[var(--r-full)] bg-tile" />
          <div className="h-4 w-3/5 rounded-[var(--r-full)] bg-tile" />
          <div className="mt-auto h-12 rounded-[var(--r-full)] bg-tile" />
        </div>
      )}
    </>
  );
}

const iconButton =
  "grid size-10 place-items-center rounded-[var(--r-full)] bg-surface text-foreground-muted hover:text-foreground";
