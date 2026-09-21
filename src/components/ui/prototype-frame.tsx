"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/**
 * A prototype, at its own size.
 *
 * The phone-shaped thumbnail is a browsing device — it makes a grid read as
 * a set of screens. It has no business here, where the point is to use the
 * thing: the prototype gets a plain frame, its real width, its own
 * scrolling, and nothing cropped.
 *
 * Expanding uses the browser's own fullscreen, so the prototype fills the
 * actual screen rather than the page's idea of one — no nav, no chrome, no
 * letterboxing.
 */
export function PrototypeFrame({
  url,
  title,
  className,
  controls,
}: {
  url?: string;
  title: string;
  className?: string;
  /** Rendered top-right, over the frame. */
  controls?: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(async () => {
    const element = container.current;
    if (!element) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setExpanded(false);
      } else {
        await element.requestFullscreen();
        setExpanded(true);
      }
    } catch {
      // Fullscreen refused (an iframe policy, an unusual browser). The
      // prototype is still perfectly usable in the page.
      setExpanded(Boolean(document.fullscreenElement));
    }
  }, []);

  if (!url) {
    return (
      <div
        className={`grid place-items-center rounded-[var(--r-lg)] border border-dashed border-border bg-surface-inset ${className ?? ""}`}
      >
        <p className="max-w-[30ch] px-6 text-center text-sm leading-[var(--leading-relaxed)] text-foreground-subtle">
          No files for this version. Push one from Claude Code with{" "}
          <span className="text-foreground-muted">/push</span>.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={container}
      className={`group/frame relative overflow-hidden border border-border bg-surface shadow-[var(--elev-raised)] ${
        expanded ? "rounded-none border-0" : "rounded-[var(--r-lg)]"
      } ${className ?? ""}`}
    >
      <iframe src={url} title={title} className="size-full border-0" />

      <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover/frame:opacity-100">
        {controls}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={controlClass}
          title="Open in a new tab"
        >
          Open
        </a>
        <button type="button" onClick={toggle} className={controlClass}>
          {expanded ? "Exit" : "Expand"}
        </button>
      </div>
    </div>
  );
}

const controlClass =
  "rounded-[var(--r-sm)] border border-border bg-surface-elevated/90 px-2.5 py-1 text-xs text-foreground backdrop-blur-md transition-colors duration-[var(--dur-fast)] hover:bg-surface-elevated";
