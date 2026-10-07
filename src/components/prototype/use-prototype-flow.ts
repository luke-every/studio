"use client";

import { useEffect, useState } from "react";

import { flowSchema, type Flow } from "@/lib/flow";

/**
 * The flow a version of a prototype describes, if its `studio.json` has one.
 * Null while loading, and for the many prototypes that are a single screen.
 */
export function usePrototypeFlow(base: string | undefined) {
  const [loaded, setLoaded] = useState<{ base: string; flow: Flow | null } | null>(null);

  useEffect(() => {
    if (!base) return;
    let current = true;

    fetch(`${base}/studio.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const parsed = flowSchema.safeParse(json);
        if (current) setLoaded({ base, flow: parsed.success ? parsed.data.flow : null });
      })
      .catch(() => current && setLoaded({ base, flow: null }));

    return () => {
      current = false;
    };
  }, [base]);

  return loaded && loaded.base === base ? loaded.flow : null;
}
