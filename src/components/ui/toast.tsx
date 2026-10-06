"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a toast stays before it lifts away. */
const TOAST_MS = 2000;

/**
 * A short message that drops in at the top, then leaves by itself.
 * `show()` again while one is up restarts it rather than stacking.
 */
export function useToast() {
  const [state, setState] = useState<"in" | "out" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback(() => {
    clearTimeout(timer.current);
    setState("in");
    timer.current = setTimeout(() => setState("out"), TOAST_MS);
  }, []);

  return { state, show, done: () => setState(null) };
}

export function Toast({
  state,
  onDone,
  children,
}: {
  state: "in" | "out" | null;
  onDone: () => void;
  children: string;
}) {
  if (!state) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 flex justify-center"
      style={{
        top: "calc(var(--nav-height) + var(--space-md))",
        zIndex: "var(--z-toast)",
      }}
    >
      <p
        onAnimationEnd={state === "out" ? onDone : undefined}
        className={`rounded-[var(--r-full)] bg-accent px-4 py-2 text-sm text-accent-foreground shadow-floating ${
          state === "in" ? "toast-in" : "toast-out"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
