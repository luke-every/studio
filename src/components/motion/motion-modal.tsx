"use client";

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";

import { layerExit, useOverlayBehaviour } from "@/lib/motion";

import { MotionScrim } from "./motion-scrim";

/**
 * MotionModal — a focused decision, centred.
 *
 * The page behind blurs and dims as the dialog fades and settles up into
 * place (the `layer-scrim` and `layer-in` presets). Escape, scroll lock, focus
 * trap and focus restoration come from useOverlayBehaviour.
 *
 * It leaves the way it came, in reverse and in half the time (`layer-out`:
 * 200ms against 400ms in), so it is kept on screen for that long after `open`
 * goes false. When one modal closes as another opens, both are seen moving.
 *
 * It never outgrows the window: the column is as wide as the window less its
 * margin (so wide content scrolls inside rather than pushing it out), and a
 * tall dialog scrolls inside itself.
 *
 * Use it when the user must deal with something before continuing. If they do
 * not have to, it should not be a modal.
 *
 * `fill` is for a place to work rather than a question: it takes most of the
 * window, and all of a phone's, and lays its children out as a column the
 * height of the dialog, which scroll inside themselves.
 */
export function MotionModal({
  open,
  onClose,
  children,
  label,
  className,
  focusSelector,
  continuing,
  successor,
  fill,
  onKeyDown,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  /** What to focus on the way in, instead of the dialog itself. */
  focusSelector?: string;
  /** Taking over from another modal that is closing as this opens: the backdrop stays put instead of fading in again. */
  continuing?: boolean;
  /** Handing over to another modal as this closes: the backdrop stays for it, and only the dialog leaves. */
  successor?: boolean;
  fill?: boolean;
  /** Keys pressed anywhere in the dialog, for its own shortcuts. */
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const container = useOverlayBehaviour({ open, onClose, focusSelector });

  // It stays on screen for as long as it takes to animate out, then goes.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open || !mounted) return;
    const timer = window.setTimeout(() => setMounted(false), layerExit * 1000);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!open && !mounted) return null;
  const leaving = !open;

  return (
    <div
      className={`fixed inset-0 grid grid-cols-[minmax(0,1fr)] place-items-center ${fill ? "sm:p-6" : "p-4"} ${leaving ? "pointer-events-none" : ""}`}
      style={{ zIndex: "var(--z-modal)" }}
    >
      {leaving && successor ? null : <MotionScrim onClick={onClose} continuing={continuing} leaving={leaving} />}
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`${leaving ? "layer-out" : "layer-in"} relative max-h-full w-full min-w-0 bg-surface-elevated shadow-[var(--elev-overlay)] outline-none ${
          fill
            ? "flex h-full max-w-[var(--modal-fill-width)] flex-col overflow-hidden sm:rounded-[var(--r-xl)]"
            : "max-w-[32rem] overflow-y-auto overscroll-contain rounded-[var(--r-xl)] p-6"
        } ${className ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
