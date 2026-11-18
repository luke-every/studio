"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { copyPage } from "./copy-page";
import type { FramePage } from "./frame-page";

import type { Snapshot } from "@/lib/dom-snapshot";
import type { Device } from "@/lib/phone";

/**
 * A screen drawn as a static copy of its page (see lib/dom-snapshot.ts) instead of the page running in a frame: the same
 * elements and styles, nothing running. It sits in a shadow root, so the studio's own styles can't reach it and the page's
 * can't leak out, and in a box that is contained, so a fixed header or bar is placed against the screen and not the window.
 */
export function ScreenCopy({
  snapshot,
  device,
  pageHeight,
  scale,
  known,
  onReady,
  onMeasured,
  register,
}: {
  snapshot: Snapshot;
  device: Device;
  /** How tall the screen is drawn, in the page's own pixels. */
  pageHeight: number;
  scale: number;
  /** Whether the canvas already knows this page's height (it was measured live before); if not, the copy's is used. */
  known: boolean;
  onReady: () => void;
  onMeasured?: (height: number) => void;
  /** Offers the copy as a page the canvas can ask what is where (see `copy-page.ts`); told null when it goes. */
  register?: (page: FramePage | null) => void;
}) {
  const template = useMemo(() => {
    const made = document.createElement("template");
    made.innerHTML = snapshot.html;
    return made;
  }, [snapshot]);
  const shadow = useRef<ShadowRoot | null>(null);
  const attach = useCallback(
    (host: HTMLDivElement | null) => {
      if (!host || host.shadowRoot) return;
      shadow.current = host.attachShadow({ mode: "open" });
      shadow.current.appendChild(template.content.cloneNode(true));
    },
    [template],
  );

  // Told once per copy: how tall it is (if nobody knew) and that it is there, on the frame after it is drawn.
  const latest = useRef({ known, onReady, onMeasured, register });
  useEffect(() => {
    latest.current = { known, onReady, onMeasured, register };
  });
  useEffect(() => {
    if (!shadow.current) return undefined;
    latest.current.register?.(copyPage(snapshot, shadow.current));
    return () => latest.current.register?.(null);
  }, [snapshot]);
  useEffect(() => {
    if (!latest.current.known) latest.current.onMeasured?.(Math.max(snapshot.height, device.height));
    const frame = requestAnimationFrame(() => latest.current.onReady());
    return () => cancelAnimationFrame(frame);
  }, [snapshot, device.height]);

  return (
    <div
      ref={attach}
      style={{ width: device.width, height: pageHeight, background: device.id === "stage" ? "transparent" : snapshot.background, transform: `scale(${scale})`, transformOrigin: "top left", overflow: "clip", contain: "content" }}
      data-copy=""
      className="pointer-events-none block"
    />
  );
}
