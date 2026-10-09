"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * The behaviour every layer above the page shares: escape closes it, the page
 * behind stops scrolling, focus moves in and is trapped, and focus returns to
 * whatever opened it on the way out.
 *
 * This is the real repeated problem behind modals, sheets and focus mode —
 * the motion differs between them, the behaviour does not.
 */
export function useOverlayBehaviour({
  open,
  onClose,
  lockScroll = true,
  trapFocus = true,
  focusSelector,
}: {
  open: boolean;
  onClose: () => void;
  lockScroll?: boolean;
  trapFocus?: boolean;
  /** Focus this inside the layer on the way in, such as a field to type into, instead of the layer itself. */
  focusSelector?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (!trapFocus || event.key !== "Tab" || !container.current) return;

      const focusable = Array.from(
        container.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    let previousOverflow = "";
    if (lockScroll) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    // Give focus to the layer itself rather than its first control, so the
    // user is not dropped onto a button they did not ask for.
    const focusTimer = window.setTimeout(() => {
      const field = focusSelector ? container.current?.querySelector<HTMLElement>(focusSelector) : null;
      (field ?? container.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(focusTimer);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, lockScroll, trapFocus, focusSelector]);

  return container;
}
