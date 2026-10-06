"use client";

import { useSyncExternalStore } from "react";

import { formatStamp } from "@/lib/format";

const subscribe = () => () => {};

/** A date and time in the reader's own time zone; see `formatStamp`. */
export function Stamp({ iso }: { iso: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return <>{formatStamp(iso, mounted)}</>;
}
