"use client";

import { useState, type ReactNode } from "react";

import { MotionScrim } from "@/components/motion";
import { useOverlayBehaviour } from "@/lib/motion";

/** The info for a phone: slides up from the bottom over the prototype, and back down when it is let go of. */
export function AboutSheet({ open, onClose, label, children, focus, lockScroll = true }: { open: boolean; onClose: () => void; label: string; children: ReactNode; /** A field to focus on the way in, rather than the sheet itself. */ focus?: string; /** Leaves the page's scrolling alone: a sheet with a field in it lets the browser move the page to keep the field above the keyboard. */ lockScroll?: boolean }) {
  const container = useOverlayBehaviour({ open, onClose, focusSelector: focus, lockScroll });
  // Kept on screen while it slides back down.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--z-drawer)" }}>
      <MotionScrim onClick={onClose} leaving={!open} />
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onAnimationEnd={() => !open && setMounted(false)}
        className={`${open ? "sheet-up" : "sheet-down pointer-events-none"} absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[var(--r-xl)] border-t border-border bg-surface-elevated p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[var(--elev-overlay)] outline-none`}
      >
        {children}
      </div>
    </div>
  );
}
