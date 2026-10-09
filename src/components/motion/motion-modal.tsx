"use client";

import type { ReactNode } from "react";

import { useOverlayBehaviour } from "@/lib/motion";

import { MotionScrim } from "./motion-scrim";

/**
 * MotionModal — a focused decision, centred.
 *
 * The page behind blurs and dims as the dialog fades and settles up into
 * place (the `layer-scrim` and `layer-in` presets). Escape, scroll lock, focus
 * trap and focus restoration come from useOverlayBehaviour.
 *
 * It never outgrows the window: the column is as wide as the window less its
 * margin (so wide content scrolls inside rather than pushing it out), and a
 * tall dialog scrolls inside itself.
 *
 * Use it when the user must deal with something before continuing. If they do
 * not have to, it should not be a modal.
 */
export function MotionModal({
  open,
  onClose,
  children,
  label,
  className,
  focusSelector,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
  /** What to focus on the way in, instead of the dialog itself. */
  focusSelector?: string;
}) {
  const container = useOverlayBehaviour({ open, onClose, focusSelector });

  if (!open) return null;

  return (
    <div className="fixed inset-0 grid grid-cols-[minmax(0,1fr)] place-items-center p-4" style={{ zIndex: "var(--z-modal)" }}>
      <MotionScrim onClick={onClose} />
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`layer-in relative max-h-full w-full min-w-0 max-w-[32rem] overflow-y-auto overscroll-contain rounded-[var(--r-xl)] bg-surface-elevated p-6 shadow-[var(--elev-overlay)] outline-none ${className ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
