"use client";

import { motion as m } from "motion/react";

import { motionRegister } from "@/lib/motion";
import type { PreviewSource } from "@/lib/data/types";

/**
 * PreviewSurface — the object that travels.
 *
 * The same component renders a prototype's preview on the hub, on the detail
 * page and inside focus mode. Giving it a stable `layoutId` is what makes the
 * thing you clicked become the thing you land on, rather than one view fading
 * out while another fades in.
 *
 * Today it paints a warm placeholder; when the data layer lands it will host a
 * live prototype iframe without anything around it changing.
 */
export function PreviewSurface({
  preview,
  layoutId,
  className,
  caption = true,
}: {
  preview: PreviewSource;
  layoutId?: string;
  className?: string;
  caption?: boolean;
}) {
  return (
    <m.div
      layoutId={layoutId}
      layout
      transition={motionRegister.spatial}
      className={`relative isolate overflow-hidden rounded-[var(--r-lg)] border border-border ${className ?? ""}`}
      style={{
        backgroundImage: `linear-gradient(145deg, ${preview.tint[0]}, ${preview.tint[1]})`,
      }}
    >
      {/* A soft paper grain keeps the placeholder from reading as a flat swatch. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.16] mix-blend-soft-light"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #fff 0, transparent 45%), radial-gradient(circle at 80% 70%, #000 0, transparent 50%)",
        }}
      />
      {caption ? (
        <m.span
          layout="position"
          className="absolute bottom-3 left-4 text-2xs font-medium tracking-[0.08em] uppercase text-[#17140f]/55"
        >
          {preview.caption}
        </m.span>
      ) : null}
    </m.div>
  );
}
