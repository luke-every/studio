"use client";

import { useEffect, useRef, useState } from "react";

import { controlsSchema, type Controls } from "@/lib/controls";

/**
 * The controls a version of a prototype offers, if it has a `studio.json`.
 * Null while loading, and for the many prototypes that offer none. A version running on its dev server (`live`, with its prototype's `slug`) is listened to: its agent
 * writes the file as it works, and the studio's watcher (`/api/controls`) says when it has, so it is read again then and not otherwise. What is drawn changes only
 * when the file's text does.
 */
export function usePrototypeControls(url: string | undefined, live?: { slug: string }, onChanged?: () => void) {
  const [loaded, setLoaded] = useState<{ url: string; controls: Controls | null } | null>(null);
  const slug = live?.slug;
  // Told when the file changes after it was first read: the prototype's own copy of it is out of date until it loads again.
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  useEffect(() => {
    if (!url) return;
    let current = true;
    let last: string | null = null;

    const read = () =>
      fetch(`${url}/studio.json`, { cache: "no-store" })
        .then((response) => (response.ok ? response.text() : ""))
        .catch(() => "")
        .then((text) => {
          if (!current || text === last) return;
          if (last !== null) changed.current?.();
          last = text;
          let json: unknown = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            // A file half written reads as none until the next change.
          }
          const parsed = controlsSchema.safeParse(json);
          setLoaded({ url, controls: parsed.success && parsed.data.controls.length ? parsed.data : null });
        });

    void read();
    // Where the studio can't watch (a page not on this machine) the stream is refused and closes: it is read once, as any version is.
    const changes = slug ? new EventSource(`/api/controls?slug=${encodeURIComponent(slug)}`) : null;
    if (changes) {
      changes.onmessage = () => void read();
      // A stream that comes back after a gap may have missed a change.
      changes.onopen = () => void read();
    }
    return () => {
      current = false;
      changes?.close();
    };
  }, [url, slug]);

  return loaded && loaded.url === url ? loaded.controls : null;
}
