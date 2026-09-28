"use client";

import { useState, type ReactNode } from "react";

import { useOverlayBehaviour } from "@/lib/motion";

/**
 * A prototype, at its own size.
 *
 * The phone-shaped thumbnail is a browsing device — it makes a grid read as
 * a set of screens. It has no business here, where the point is to use the
 * thing: the prototype gets a plain frame, its real width, its own
 * scrolling, and nothing cropped.
 *
 * Expanding fills the window rather than calling the browser's fullscreen.
 * Fullscreen hides the tabs and the address bar, which makes the studio feel
 * like it has been left behind; taking over the window keeps the prototype
 * in the place the person already is. Escape comes back.
 *
 * Crucially it is the *same* iframe either way — only its container's
 * classes change — so expanding never reloads the prototype or throws away
 * whatever state somebody had got it into.
 */
export function PrototypeFrame({
  url,
  title,
  className,
  leading,
}: {
  url?: string;
  title: string;
  /** Sizes the frame itself, not the row of controls above it. */
  className?: string;
  /** Rendered at the start of the row above the frame. */
  leading?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const container = useOverlayBehaviour({
    open: expanded,
    onClose: () => setExpanded(false),
    // The prototype inside owns its own focus; trapping it fights the thing
    // the person is trying to use.
    trapFocus: false,
  });

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

  // The controls sit outside the frame, always visible. Over the frame they
  // had to hide until hovered so as not to cover the prototype — and a
  // phone can't hover, so there they could never be reached. Expanded, the
  // same row becomes a thin bar across the top, which keeps Close within
  // reach of a thumb as well as Escape.
  return (
    <div
      ref={container}
      tabIndex={-1}
      className={
        expanded ? "fixed inset-0 flex flex-col bg-surface outline-none" : "flex flex-col gap-3 outline-none"
      }
      style={expanded ? { zIndex: "var(--z-focus-mode)" } : undefined}
    >
      <div
        className={`flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-2 ${
          expanded ? "border-b border-border px-3 py-2" : ""
        }`}
      >
        <div className="min-w-0 text-xs">{expanded ? <span className="text-foreground-muted">{title}</span> : leading}</div>
        <div className="ml-auto flex items-center gap-1.5">
          {expanded ? (
            <span className="mr-1 hidden text-2xs uppercase tracking-[var(--tracking-caps)] text-foreground-subtle sm:inline">
              Esc
            </span>
          ) : null}
          <a href={url} target="_blank" rel="noreferrer" className={controlClass} title="Open in a new tab">
            Open
          </a>
          <button type="button" onClick={() => setExpanded((value) => !value)} className={controlClass}>
            {expanded ? "Close" : "Expand"}
          </button>
        </div>
      </div>

      {/* The same element either way — only classes change — so expanding
       * never reloads the prototype. */}
      <div
        className={
          expanded
            ? "min-h-0 flex-1"
            : `overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface shadow-[var(--elev-raised)] ${className ?? ""}`
        }
      >
        {/* Same-origin now that the studio serves these, so the frame is
         * sandboxed: a prototype can do everything it needs and cannot reach
         * out into the page around it. */}
        <iframe
          src={url}
          title={title}
          className="size-full border-0"
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
        />
      </div>
    </div>
  );
}

const controlClass =
  "inline-flex h-8 items-center rounded-[var(--r-sm)] border border-border bg-surface-elevated px-3 text-xs text-foreground transition-colors duration-[var(--dur-fast)] hover:bg-surface-inset";
