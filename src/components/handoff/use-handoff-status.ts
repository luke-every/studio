"use client";

import { useEffect, useState } from "react";

import { handoffStatusOf } from "@/lib/registry/actions";

export type HandoffStatus = { total: number; left: number; signedBy: string | null; variants: string[]; scannedAt: string };

/**
 * How far a version's handoff has got, or null when there is none. It is asked for when the version is opened and whenever
 * the tab is looked at again (that is where a /handoff that has just run shows up); never on a timer. `again` is anything
 * that should make it look now (the review being closed). It is read in the browser, so the page stays prerendered.
 */
export function useHandoffStatus(slug: string, versionKey: string, again?: unknown) {
  const [loaded, setLoaded] = useState<{ key: string; status: HandoffStatus | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void handoffStatusOf(slug, versionKey).then((result) => {
        if (!alive) return;
        const status = result.ok ? result.value : null;
        // Only a change is a new state: the page holding this must not be drawn again every few seconds for nothing.
        setLoaded((now) => (now && now.key === versionKey && JSON.stringify(now.status) === JSON.stringify(status) ? now : { key: versionKey, status }));
      });
    load();
    const reload = () => {
      if (!document.hidden) load();
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      alive = false;
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [slug, versionKey, again]);

  return loaded?.key === versionKey ? loaded.status : null;
}
