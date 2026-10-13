"use client";

import { useCallback, useSyncExternalStore } from "react";

const CHANGED = "proto:flag";

/**
 * A yes/no kept in this browser, for things that happen once per person, like
 * having seen a prompt. False on the server and until the browser is read, so
 * anything shown "until it is set" waits for the page to be on screen.
 */
export function useFlag(key: string) {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGED, listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener(CHANGED, listener);
    };
  }, []);

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
