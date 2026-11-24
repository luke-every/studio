"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/** Where the terminal (`scripts/terminal-server.mjs`) listens. Only the studio running on this machine can reach it. */
export const TERMINAL_HOST = "127.0.0.1:4748";

/** The prototype whose terminal panel is open, if any: it is open for one prototype, never for whichever page comes next. */
let openSlug: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const set = (next: string | null) => {
  openSlug = next;
  for (const listener of listeners) listener();
};

/** What a new prototype can start from, or null when the helper isn't reachable (the studio on Vercel, or the helper not running). */
export type Starts = { templates: { name: string; about: string }[]; default: string };

export function useStarts() {
  const [starts, setStarts] = useState<Starts | null>(null);
  useEffect(() => {
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) return undefined;
    let live = true;
    fetch(`http://${TERMINAL_HOST}/templates`)
      .then((response) => (response.ok ? (response.json() as Promise<Starts>) : null))
      .then((found) => {
        if (live && found) setStarts(found);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return starts;
}

/** The prototypes whose Claude is running, as far as this page knows: opening the panel for one attaches to it and doesn't ask to start it. Told by the helper (a reload forgets this). */
export const begun = new Set<string>();

const ARRIVE = "terminal:open-on-arrival";
/** `slug`'s page opens with its terminal already open (a new prototype's own page). Remembered across the page load that gets there. */
export function openTerminalOnArrival(slug: string) {
  try {
    sessionStorage.setItem(ARRIVE, slug);
  } catch {}
}

/**
 * The terminal for a prototype's folder: whether it can start (the studio is the one on this machine, the terminal is
 * running, and the prototype has a folder here) and whether its panel is open. The top bar and the frame share it.
 */
export function useTerminal(slug: string | null) {
  const current = useSyncExternalStore(subscribe, () => openSlug, () => null);
  // What the helper said about this prototype: it can have a terminal, it has no folder here (so it can't), or the helper isn't running (which the panel offers to start).
  const [probe, setProbe] = useState<{ slug: string; status: "ready" | "missing" | "down" } | null>(null);
  useEffect(() => {
    if (!slug || !["localhost", "127.0.0.1"].includes(location.hostname)) return undefined;
    let live = true;
    fetch(`http://${TERMINAL_HOST}/?slug=${slug}`)
      .then((response) => {
        // 200 and not 204: a session is already running there.
        if (response.status === 200) begun.add(slug);
        if (live) setProbe({ slug, status: response.ok ? "ready" : "missing" });
      })
      .catch(() => live && setProbe({ slug, status: "down" }));
    return () => {
      live = false;
    };
  }, [slug]);
  useEffect(() => {
    try {
      if (slug && sessionStorage.getItem(ARRIVE) === slug) {
        sessionStorage.removeItem(ARRIVE);
        set(slug);
      }
    } catch {}
  }, [slug]);
  const available = !!slug && probe?.slug === slug && probe.status !== "missing";
  const toggle = useCallback(() => set(openSlug === slug ? null : slug), [slug]);
  // Ends the session in the folder, not only the panel: a closed panel leaves it running, and this is how it is let go.
  const stop = useCallback(() => {
    set(null);
    if (slug) fetch(`http://${TERMINAL_HOST}/end?slug=${slug}`, { method: "POST" }).catch(() => {});
  }, [slug]);
  // `ready`: the helper answered and has the folder, which is what pushing needs (`available` also holds while the helper is down, for the panel to start it).
  const ready = !!slug && probe?.slug === slug && probe.status === "ready";
  return { available, ready, open: available && !!slug && current === slug, toggle, stop };
}

/** Tells the helper what is chosen in the prototype (or nothing, with null), for Claude to be told as the next prompt is sent. */
export function sendSelection(slug: string, line: string | null) {
  fetch(`http://${TERMINAL_HOST}/selection?slug=${slug}`, { method: "POST", body: line ?? "" }).catch(() => {});
}
