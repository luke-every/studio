"use client";

import { useEffect, useState } from "react";

/** A copy of a component this project has made: the component's id (what the stage and the project's own stage page draw it by) and its name. */
export type ProjectFork = { id: string; label: string };

/** The copies the project has made. Asked for again each time the panel opens, since one may have been made since. */
export function useProjectForks(slug: string | undefined, wanted: boolean) {
  const [forks, setForks] = useState<{ slug: string; list: ProjectFork[] } | null>(null);
  useEffect(() => {
    if (!wanted || !slug) return undefined;
    let stale = false;
    fetch(`/api/forks?slug=${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? (response.json() as Promise<{ forks: ProjectFork[] }>) : { forks: [] }))
      .then((found) => !stale && setForks({ slug, list: found.forks }))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [slug, wanted]);
  return forks && forks.slug === slug ? forks.list : [];
}
