"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Align = "start" | "end";

/**
 * MotionPopover — a layer with a visible origin.
 *
 * Menus and popovers open from the control that summoned them: the transform
 * origin is the corner nearest that control, so the layer grows out of the
 * trigger (the `popover-in` preset). Nothing appears from nowhere.
 *
 * Dismissal (outside pointer, escape) lives here too, because every popover
 * needs it and none of them should reimplement it.
 */
export function MotionPopover({
  open,
  onClose,
  trigger,
  children,
  align = "end",
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** The control that owns this popover. Rendered as the anchor. */
  trigger: ReactNode;
  children: ReactNode;
  align?: Align;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div ref={container} className="relative">
      {trigger}

      {open ? (
        <div
          style={{
            transformOrigin: align === "end" ? "top right" : "top left",
            zIndex: "var(--z-popover)",
          }}
          className={`popover-in absolute top-[calc(100%+0.5rem)] ${align === "end" ? "right-0" : "left-0"} overflow-hidden rounded-[var(--r-lg)] border border-border bg-surface-elevated p-1 shadow-[var(--elev-floating)] ${className ?? ""}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
