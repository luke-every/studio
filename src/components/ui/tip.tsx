"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/** How long the pointer rests on a control before its label shows. */
const REST_MS = 1000;
/** How long after a label has gone the next control still shows its own at once: crossing the gap to its neighbour, not coming back later. */
const WARM_MS = 300;

// Shared by every control, so the delay is about the person's intent and not about each button: once a label has shown, the pointer moving
// along to the next control is the same interaction and its label shows at once. Leaving for longer than WARM_MS, and coming back, starts again.
let warm = false;
let cooling: ReturnType<typeof setTimeout> | undefined;
const cool = () => {
  clearTimeout(cooling);
  cooling = setTimeout(() => {
    warm = false;
  }, WARM_MS);
};

/**
 * The small label a control shows to say what it is: after the pointer has rested on it for a second, then at once for
 * the controls beside it while the same pass goes on. Pressing it, or leaving, puts the label away. Keyboard focus shows it
 * at once (the control it wraps carries the `peer` class), and a touch never does.
 */
export function Tip({ label, side, align, children }: { label: string; side: "below" | "above"; align: "start" | "center" | "end"; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const wait = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      clearTimeout(wait.current);
      if (warm) cool();
    },
    [],
  );

  const show = () => {
    clearTimeout(cooling);
    warm = true;
    setShown(true);
  };
  const enter = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    clearTimeout(cooling);
    clearTimeout(wait.current);
    if (warm) show();
    else wait.current = setTimeout(show, REST_MS);
  };
  const put = () => {
    clearTimeout(wait.current);
    setShown(false);
  };
  const leave = () => {
    put();
    if (warm) cool();
  };

  return (
    <span className="group/tip relative inline-flex" onPointerEnter={enter} onPointerLeave={leave} onPointerDown={put}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${side === "above" ? "bottom-full mb-2" : "top-full mt-2"} whitespace-nowrap rounded-[var(--r-md)] bg-accent px-2.5 py-1 text-xs font-normal text-accent-foreground ${shown ? "opacity-100" : "opacity-0"} transition-opacity duration-[var(--dur-instant)] ease-[var(--curve-entrance)] peer-focus-visible:opacity-100 ${
          align === "end" ? "right-0" : align === "start" ? "left-0" : "left-1/2 -translate-x-1/2"
        }`}
        style={{ zIndex: "var(--z-popover)" }}
      >
        {label}
      </span>
    </span>
  );
}
