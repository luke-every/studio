"use client";

import { useEffect, useState } from "react";

import { handoffStatusOf } from "@/lib/registry/actions";

export type HandoffStatus = { total: number; left: number; signedBy: string | null; variants: string[]; scannedAt: string };

/** How often a running prototype's handoff is looked at, so a scan that has just finished appears without a refresh. */
const EVERY_MS = 3000;

/**
 * How far a version's handoff has got, or null when there is none. The Live version (running on this machine) is asked
 * for every few seconds while the tab is showing, since that is where /handoff has just been run; a pushed version when
 * the tab is looked at again. `again` is anything that should make it look now (the review being closed). It is read in
 * the browser, so the page stays prerendered.
 */
export function useHandoffStatus(slug: string, versionKey: string, live: boolean, again?: unknown) {
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
    const timer = live ? window.setInterval(reload, EVERY_MS) : 0;
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [slug, versionKey, live, again]);

  return loaded?.key === versionKey ? loaded.status : null;
}
