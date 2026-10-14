"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AlertIcon,
  ArchiveIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  SendIcon,
  UndoIcon,
} from "@/components/shell/nav-icons";

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

/** The icon that matches what the message says; a tick for anything that just saved. */
const ICONS: [RegExp, typeof CheckIcon][] = [
  [/^archived/i, ArchiveIcon],
  [/^restored/i, UndoIcon],
  [/^renamed/i, PencilIcon],
  [/^moved/i, SendIcon],
  [/^copied/i, CopyIcon],
];

function toastIcon(message: string, error: boolean) {
  if (error) return <AlertIcon />;
  const Match = ICONS.find(([pattern]) => pattern.test(message))?.[1] ?? CheckIcon;
  return <Match />;
}

export function Toast({
  state,
  onDone,
  error = false,
  children,
}: {
  state: "in" | "out" | null;
  onDone: () => void;
  error?: boolean;
  children: string;
}) {
  if (!state) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 flex justify-center"
      style={{
        top: "var(--toast-top)",
        zIndex: "var(--z-toast)",
      }}
    >
      <p
        onAnimationEnd={state === "out" ? onDone : undefined}
        className={`flex items-center gap-2 rounded-[var(--r-full)] bg-accent px-4 py-2 text-sm text-accent-foreground shadow-floating ${
          state === "in" ? "toast-in" : "toast-out"
        }`}
      >
        {toastIcon(children, error)}
        {children}
      </p>
    </div>
  );
}
