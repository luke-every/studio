"use client";

import { useSyncExternalStore } from "react";

import { formatStamp, formatWhen } from "@/lib/format";

const subscribe = () => () => {};

/**
 * A date and time in the reader's own time zone; see `formatStamp`.
 * `relative` says "Today, 14:00" or "Yesterday" while it still can.
 */
export function Stamp({ iso, relative }: { iso: string; relative?: boolean }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{(relative ? formatWhen : formatStamp)(iso, mounted)}</>;
}
