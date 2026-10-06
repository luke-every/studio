"use client";

import { useEffect, useState } from "react";

import { controlsSchema, type Controls } from "@/lib/controls";

/**
 * The controls a version of a prototype offers, if it has a `studio.json`.
 * Null while loading, and for the many prototypes that offer none.
 */
export function usePrototypeControls(url: string | undefined) {
  const [loaded, setLoaded] = useState<{ url: string; controls: Controls | null } | null>(null);

  useEffect(() => {
    if (!url) return;
    let current = true;

    fetch(`${url}/studio.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const parsed = controlsSchema.safeParse(json);
        if (current) setLoaded({ url, controls: parsed.success && parsed.data.controls.length ? parsed.data : null });
      })
      .catch(() => current && setLoaded({ url, controls: null }));

    return () => {
      current = false;
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.controls : null;
}
