"use client";

import { useEffect, useRef, useState } from "react";

import { LivePreview } from "./live-preview";

/**
 * What a tile shows of a prototype: the picture taken when it was pushed.
 *
 * An image costs a few kilobytes, is cached for good (a version never
 * changes) and can't be tapped, so a long feed stays light and nothing
 * reloads or flashes when you come back to it.
 *
 * The picture is made by a workflow on GitHub a minute or so after a push,
 * and older versions may not have one. Until it exists the request fails and
 * the tile falls back to the running prototype.
 */
export function TilePicture({ url, title }: { url: string; title: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  // The server-rendered <img> can finish, or fail, before React is listening.
  useEffect(() => {
    const element = image.current;
    if (!element?.complete) return;
    setState(element.naturalWidth > 0 ? "ready" : "missing");
  }, []);

  if (state === "missing") return <LivePreview src={url} title={title} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={image}
      src={`${url}/studio-preview.jpg`}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setState("ready")}
      onError={() => setState("missing")}
      data-ready={state === "ready" || undefined}
      className="fade-in absolute inset-0 size-full object-cover object-top"
    />
  );
}
