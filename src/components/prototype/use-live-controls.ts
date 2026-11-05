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
 *
 * When the prototype moves itself (it writes where it is into its own address),
 * `follow` is given the address that makes: the frame is not sent there, since
 * it is there already, and a live prototype is not told it back.
 */
export function useLiveControls(address: string | undefined, docKey: string, params: Record<string, string>, paused: boolean) {
  const current = address ? embedded(address) : undefined;
  const [live, setLive] = useState<{ docKey: string; src: string; window: Window; origin: string } | null>(null);
  if (live && (paused || live.docKey !== docKey)) setLive(null);
  // The address the prototype moved itself to, and the frame's address from before, which it is kept at.
  const [held, setHeld] = useState<{ for: string; src: string } | null>(null);
  // What the prototype said it moved to, so the change it made isn't posted back to it.
  const heard = useRef<string | null>(null);

  const src = live ? live.src : held && held.for === current ? held.src : current;
  const query = JSON.stringify(params);
  const latest = useRef({ src, docKey, paused, query });
  useEffect(() => {
    latest.current = { src, docKey, paused, query };
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
      setLive({ docKey, src, window: source, origin: event.origin });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // On becoming live, and on every change after: the prototype is told what the address would have said.
  useEffect(() => {
    const told = heard.current === query;
    heard.current = null;
    if (!told) live?.window.postMessage({ type: "studio:controls", params: JSON.parse(query) }, live.origin);
  }, [live, query]);

  const follow = (next: string, nextParams: Record<string, string>) => {
    // Only a change is posted, so only a change is held back.
    const told = JSON.stringify(nextParams);
    heard.current = told === latest.current.query ? null : told;
    setHeld({ for: embedded(next), src: latest.current.src ?? embedded(next) });
  };

  return { src, follow };
}
