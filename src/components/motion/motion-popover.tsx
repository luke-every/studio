"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Align = "start" | "center" | "end";

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
  above = false,
  rootClassName = "relative",
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** The control that owns this popover. Rendered as the anchor. */
  trigger: ReactNode;
  children: ReactNode;
  align?: Align;
  /** Opens upward, for a trigger at the bottom of the screen. */
  above?: boolean;
  /** How the anchor is positioned. `static` lets the layer hang from the nearest positioned ancestor instead of the trigger. */
  rootClassName?: string;
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
    <div ref={container} className={rootClassName}>
      {trigger}

      {open ? (
        <div
          style={{
            transformOrigin: `${above ? "bottom" : "top"} ${align === "end" ? "right" : align === "center" ? "center" : "left"}`,
            zIndex: "var(--z-popover)",
          }}
          className={`popover-in absolute ${above ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"} ${align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"} overflow-hidden rounded-[var(--r-popover)] border border-border bg-surface-elevated p-2 shadow-[var(--elev-floating)] ${className ?? ""}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
