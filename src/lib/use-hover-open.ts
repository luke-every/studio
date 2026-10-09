import { useRef, useState, type PointerEvent } from "react";

/**
 * A menu that opens when a mouse rests on it as well as when it is clicked.
 * Leaving closes it after a beat, so crossing the gap to the menu doesn't. A
 * finger never hovers: touch only ever taps.
 */
export function useHoverOpen() {
  const [open, setOpen] = useState(false);
  const leaving = useRef<number | undefined>(undefined);

  const hover = (on: boolean) => (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(leaving.current);
    if (on) setOpen(true);
    else leaving.current = window.setTimeout(() => setOpen(false), 150);
  };

  return { open, setOpen, hoverProps: { onPointerEnter: hover(true), onPointerLeave: hover(false) } };
}
