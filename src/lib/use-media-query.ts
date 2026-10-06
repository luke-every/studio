"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Whether a CSS media query matches right now, and keeps matching as the window changes. False on the server. */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", listener);
      return () => list.removeEventListener("change", listener);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
