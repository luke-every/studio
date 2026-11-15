"use client";

import { useEffect, useState } from "react";

import type { PublicHandoff } from "@/lib/handoff-public";

/** A version's handoff for somebody with only its share link: read once, by the link's token. Null until there is one. */
export function useSharedHandoff(slug: string, folder: string, token: string) {
  const [loaded, setLoaded] = useState<{ key: string; data: PublicHandoff } | null>(null);
  const key = `${slug}|${folder}`;
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({ slug, version: folder, token });
    fetch(`/api/review/handoff?${query}`)
      .then((response) => (response.ok ? (response.json() as Promise<PublicHandoff>) : null))
      .then((data) => alive && data && setLoaded({ key, data }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [slug, folder, token, key]);
  return loaded?.key === key && loaded.data.ready ? loaded.data : null;
}
