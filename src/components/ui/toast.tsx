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

/** How long a toast stays before it lifts away; and one with something to press, long enough to press it. */
const TOAST_MS = 2000;
const TOAST_ACTION_MS = 8000;

/** Something a toast offers to do about what it says, such as undoing it. */
export type ToastAction = { label: string; onPress: () => void };

/**
 * A short message that drops in at the top, then leaves by itself.
 * `show()` again while one is up restarts it rather than stacking.
 */
export function useToast() {
  const [state, setState] = useState<"in" | "out" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((withAction = false) => {
    clearTimeout(timer.current);
    setState("in");
    timer.current = setTimeout(() => setState("out"), withAction ? TOAST_ACTION_MS : TOAST_MS);
  }, []);
  // Leaves now: what it offered was taken.
  const leave = useCallback(() => {
    clearTimeout(timer.current);
    setState((now) => (now ? "out" : now));
  }, []);

  return { state, show, leave, done: () => setState(null) };
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
  // A hint, not a confirmation: nothing was saved.
  if (/^press/i.test(message)) return null;
  const Match = ICONS.find(([pattern]) => pattern.test(message))?.[1] ?? CheckIcon;
  return <Match />;
}

export function Toast({
  state,
  onDone,
  error = false,
  action,
  children,
}: {
  state: "in" | "out" | null;
  onDone: () => void;
  error?: boolean;
  /** A button at the end of the message. The toast itself never takes a press; only this does. */
  action?: ToastAction;
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
        {action ? (
          <button type="button" onClick={action.onPress} className="pointer-events-auto -my-1 -mr-2 rounded-[var(--r-full)] px-2 py-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            {action.label}
          </button>
        ) : null}
      </p>
    </div>
  );
}
