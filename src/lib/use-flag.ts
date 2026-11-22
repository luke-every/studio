"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "proto:flag";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGED, listener);
  };
}

/**
 * A yes/no that goes either way and is kept in this browser, like whether a panel was left open. False on the server and
 * until the browser is read; a page that is only drawn once somebody opens it (the canvas) reads it before its first paint.
 */
export function useSwitch(key: string) {
  const on = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const set = useCallback(
    (next: boolean | ((now: boolean) => boolean)) => {
      try {
        const value = typeof next === "function" ? next(localStorage.getItem(key) === "1") : next;
        localStorage.setItem(key, value ? "1" : "0");
      } catch {
        // Blocked storage: it stays as it was.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );
  return [on, set] as const;
}

/**
 * A yes/no kept in this browser, for things that happen once per person, like
 * having seen a prompt. False on the server and until the browser is read, so
 * anything shown "until it is set" waits for the page to be on screen.
 */
export function useFlag(key: string) {
  const set = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    // Nothing is offered until the page is on screen.
    () => true,
  );

  const mark = useCallback(() => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      // Blocked storage: it comes back next visit.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, [key]);

  return [set, mark] as const;
}
