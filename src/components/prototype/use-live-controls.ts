"use client";

import { useEffect, useRef, useState } from "react";

import { embedded } from "@/lib/controls";

/**
 * The address for a prototype's iframe, and how control changes reach it.
 *
 * Until the prototype says `studio:ready`, a changed control changes the
 * address (the iframe reloads). Once it has, the address is held still and
 * the changes are posted to it as `studio:controls` instead. See docs/controls.md.
 *
 * `docKey` names the document: a new one (another version or variant) starts
 * over from reloading. `paused` is for while a canvas is up in its place.
 */
export function useLiveControls(address: string | undefined, docKey: string, params: Record<string, string>, paused: boolean) {
  const current = address ? embedded(address) : undefined;
  const [live, setLive] = useState<{ docKey: string; src: string; window: Window; origin: string } | null>(null);
  if (live && (paused || live.docKey !== docKey)) setLive(null);

  const src = live ? live.src : current;
  const latest = useRef({ src, docKey, paused });
  useEffect(() => {
    latest.current = { src, docKey, paused };
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "studio:ready" || !event.source) return;
      const source = event.source as Window;
      const { src, docKey, paused } = latest.current;
      if (!src || paused) return;
      // Only the frame on screen counts, not a canvas screen or a tile.
      const frame = [...document.querySelectorAll("iframe")].find((item) => item.contentWindow === source);
      if (!frame || frame.getAttribute("src") !== src) return;
      setLive({ docKey, src, window: source, origin: new URL(src, window.location.href).origin });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // On becoming live, and on every change after: the prototype is told what the address would have said.
  const query = JSON.stringify(params);
  useEffect(() => {
    live?.window.postMessage({ type: "studio:controls", params: JSON.parse(query) }, live.origin);
  }, [live, query]);

  return src;
}
