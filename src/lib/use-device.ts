"use client";

import { useCallback, useSyncExternalStore } from "react";

import { DEFAULT_DEVICE, DEFAULT_ZOOM, DEVICES, type Device } from "./phone";

const CHANGED = "proto:preference";

/**
 * A preference kept in this browser, so it is the person's own and survives
 * visits. On the server it is always `null` (the default), and corrects itself
 * once the page is on screen.
 */
function useStored(key: string) {
  const subscribe = useCallback((listener: () => void) => {
    window.addEventListener("storage", listener);
    window.addEventListener(CHANGED, listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener(CHANGED, listener);
    };
  }, []);

  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const set = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Blocked storage: the choice holds until the page is closed.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [key],
  );

  return [value, set] as const;
}

/** Which phone this person previews on. */
export function useDevice() {
  const [id, set] = useStored("proto.device");
  const device: Device = DEVICES.find((candidate) => candidate.id === id) ?? DEFAULT_DEVICE;
  return [device, (next: Device) => set(next.id)] as const;
}

/** How far they have zoomed the preview, as a multiple of fitting the frame. */
export function useZoom() {
  const [stored, set] = useStored("proto.zoom");
  const zoom = Number(stored);
  return [Number.isFinite(zoom) && zoom > 0 ? zoom : DEFAULT_ZOOM, (next: number) => set(String(next))] as const;
}
