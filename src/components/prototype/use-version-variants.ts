"use client";

import { useEffect, useState } from "react";

import type { EditsFile } from "@/lib/edits";

/** The variants made in the studio for a version, if it has any: what its `edits.json` lists. Empty while loading. */
export function useVersionVariants(url: string | undefined) {
  const [loaded, setLoaded] = useState<{ url: string; variants: { id: string; label: string }[] } | null>(null);

  useEffect(() => {
    if (!url) return;
    let current = true;

    fetch(`${url}/edits.json`)
      .then((response) => (response.ok ? (response.json() as Promise<EditsFile>) : null))
      .then((file) => {
        if (current) setLoaded({ url, variants: (file?.variants ?? []).map(({ id, label }) => ({ id, label })) });
      })
      .catch(() => current && setLoaded({ url, variants: [] }));

    return () => {
      current = false;
    };
  }, [url]);

  return loaded && loaded.url === url ? loaded.variants : [];
}
