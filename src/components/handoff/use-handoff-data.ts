"use client";

import { useEffect, useState } from "react";

import type { PublicHandoff } from "@/lib/handoff-public";
import { handoffPublicOf } from "@/lib/registry/actions";

/**
 * A version's handoff as engineers are given it, for the studio's own canvas: read when there is one (`enabled`), and
 * again when `changed` does (the handoff moved on). Null until then.
 */
export function useHandoffData(slug: string, versionKey: string, enabled: boolean, changed: string) {
  const [loaded, setLoaded] = useState<{ key: string; data: PublicHandoff } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    handoffPublicOf(slug, versionKey).then((result) => {
      if (alive && result.ok && result.value.ready) setLoaded({ key: versionKey, data: result.value });
    });
    return () => {
      alive = false;
    };
  }, [slug, versionKey, enabled, changed]);
  return enabled && loaded?.key === versionKey ? loaded.data : null;
}
