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
 * Use it when the user must deal with something before continuing. If they do
 * not have to, it should not be a modal.
 */
export function MotionModal({
  open,
  onClose,
  children,
  label,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const container = useOverlayBehaviour({ open, onClose });

  if (!open) return null;

  return (
    <div className="fixed inset-0 grid place-items-center p-4" style={{ zIndex: "var(--z-modal)" }}>
      <MotionScrim onClick={onClose} />
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`layer-in relative w-full max-w-[32rem] rounded-[var(--r-xl)] bg-surface-elevated p-6 shadow-[var(--elev-overlay)] outline-none ${className ?? ""}`}
      >
        {children}
      </div>
    </div>
  );
}
