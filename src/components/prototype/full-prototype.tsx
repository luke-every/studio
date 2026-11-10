"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * One prototype filling the window. Every parameter is passed on to the prototype. Read as an external store rather than with
 * useSearchParams, which would stop this page being prerendered.
 */
export function FullPrototype({ slug, version }: { slug: string; version: string }) {
  const subscribe = useCallback(() => () => {}, []);
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const rest = params.toString();
  const src = `/p/${encodeURIComponent(slug)}/${encodeURIComponent(version)}${rest ? `?${rest}` : ""}`;

  return (
    <iframe
      src={src}
      title={`${slug} ${version}`}
      className="block h-dvh w-screen border-0"
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
    />
  );
}
