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
  controls,
}: {
  url?: string;
  title: string;
  className?: string;
  /** Rendered top-right, over the frame. */
  controls?: ReactNode;
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

  return (
    <div
      ref={container}
      tabIndex={-1}
      className={
        expanded
          ? "group/frame fixed inset-0 overflow-hidden border-0 bg-surface outline-none"
          : `group/frame relative overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface shadow-[var(--elev-raised)] outline-none ${className ?? ""}`
      }
      style={expanded ? { zIndex: "var(--z-focus-mode)" } : undefined}
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

      <div
        className={`absolute right-3 top-3 flex items-center gap-1.5 transition-opacity duration-[var(--dur-fast)] focus-within:opacity-100 group-hover/frame:opacity-100 ${
          expanded ? "opacity-100" : "opacity-0"
        }`}
      >
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
        <button type="button" onClick={() => setExpanded((value) => !value)} className={controlClass}>
          {expanded ? "Close" : "Expand"}
        </button>
        {expanded ? (
          <span className="text-2xs uppercase tracking-[var(--tracking-caps)] text-foreground-subtle">
            Esc
          </span>
        ) : null}
      </div>
    </div>
  );
}

const controlClass =
  "rounded-[var(--r-sm)] border border-border bg-surface-elevated/90 px-2.5 py-1 text-xs text-foreground backdrop-blur-md transition-colors duration-[var(--dur-fast)] hover:bg-surface-elevated";
