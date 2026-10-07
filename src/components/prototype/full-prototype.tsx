"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { applyWireframe, WIREFRAME_FRAME_FILTER } from "@/lib/wireframe";

/**
 * One prototype filling the window. `?wireframe` puts it in the wireframe view,
 * exactly as the studio's own frame does; every other parameter is passed on
 * to the prototype. Read as an external store rather than with
 * useSearchParams, which would stop this page being prerendered.
 */
export function FullPrototype({ slug, version }: { slug: string; version: string }) {
  const subscribe = useCallback(() => () => {}, []);
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const wireframe = params.has("wireframe");
  params.delete("wireframe");
  const rest = params.toString();
  const src = `/p/${encodeURIComponent(slug)}/${encodeURIComponent(version)}${rest ? `?${rest}` : ""}`;

  const frame = useRef<HTMLIFrameElement>(null);
  // Counts every document loaded, so a link inside the prototype to another page is styled too.
  const [documents, setDocuments] = useState(0);
  useEffect(() => {
    if (frame.current?.contentDocument?.readyState === "complete") setDocuments((count) => count + 1);
  }, []);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    return doc ? applyWireframe(doc, wireframe) : undefined;
  }, [wireframe, documents]);

  return (
    <iframe
      ref={frame}
      src={src}
      title={`${slug} ${version}`}
      onLoad={() => setDocuments((count) => count + 1)}
      style={{ filter: wireframe ? WIREFRAME_FRAME_FILTER : undefined }}
      className="block h-dvh w-screen border-0"
      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
    />
  );
}
