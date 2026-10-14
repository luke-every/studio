"use client";

import { useLayoutEffect, useRef, useState } from "react";

import type { Device } from "@/lib/phone";

/**
 * A prototype at its device's real size, scaled down to fit the room it is
 * given, so it is laid out exactly as on the phone however small it is drawn.
 */
export function ScaledScreen({ src, device, title }: { src: string; device: Device; title: string }) {
  const room = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const element = room.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, width / device.width, height / device.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [device.width, device.height]);

  return (
    <div ref={room} className="grid size-full min-h-0 place-items-center">
      {scale ? (
        <div
          style={{ width: device.width * scale, height: device.height * scale }}
          className={`relative overflow-clip bg-surface [transform:translateZ(0)] ${device.kind === "phone" ? "rounded-[var(--r-device)]" : "rounded-[var(--r-lg)]"}`}
        >
          <iframe
            src={src}
            title={title}
            style={{ width: device.width, height: device.height, transform: `scale(${scale})` }}
            className="block origin-top-left border-0"
          />
        </div>
      ) : null}
    </div>
  );
}
