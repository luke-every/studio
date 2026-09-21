"use client";

import { motion as m } from "motion/react";

import { MOTION_ENABLED, motionRegister } from "@/lib/motion";
import type { PreviewSource } from "@/lib/data/types";

type Size = "sm" | "md" | "lg";

const corner: Record<Size, string> = {
  sm: "rounded-[var(--r-device-sm)]",
  md: "rounded-[var(--r-device)]",
  lg: "rounded-[calc(var(--r-device)*1.4)]",
};

/**
 * A prototype, as an object on the page.
 *
 * Every prototype in the studio is a phone screen, so every preview is the
 * same shape: iPhone proportions, device corners, and a contact shadow so it
 * sits on the surface rather than being pasted onto it. One shape everywhere
 * is what makes a grid of them read as a set of screens.
 *
 * Today it paints a placeholder; when the data layer lands it hosts a live
 * prototype without anything around it changing.
 */
export function PreviewSurface({
  preview,
  layoutId,
  className,
  size = "md",
  caption = false,
  lifted = false,
}: {
  preview: PreviewSource;
  layoutId?: string;
  className?: string;
  size?: Size;
  caption?: boolean;
  /** Raises the shadow — for a preview that is being focused or hovered. */
  lifted?: boolean;
}) {
  const body = (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-soft-light"
        style={{
          backgroundImage:
            "radial-gradient(circle at 24% 16%, #fff 0, transparent 46%), radial-gradient(circle at 78% 74%, #000 0, transparent 52%)",
        }}
      />
      {/* A hairline inside the corner keeps the screen crisp against a light
       * background without drawing a visible border. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${corner[size]} ring-1 ring-inset ring-[#000]/10`}
      />
      {caption ? (
        <span className="absolute bottom-3 left-0 right-0 text-center text-2xs uppercase tracking-[var(--tracking-caps)] text-[#121211]/50">
          {preview.caption}
        </span>
      ) : null}
    </>
  );

  const classes = `relative isolate overflow-hidden aspect-device ${corner[size]} ${
    lifted ? "shadow-[var(--elev-device-lifted)]" : "shadow-[var(--elev-device)]"
  } ${className ?? ""}`;

  const style = {
    backgroundImage: `linear-gradient(155deg, ${preview.tint[0]}, ${preview.tint[1]})`,
  };

  if (!MOTION_ENABLED) {
    return (
      <div className={classes} style={style}>
        {body}
      </div>
    );
  }

  return (
    <m.div
      layoutId={layoutId}
      layout
      transition={motionRegister.spatial}
      className={classes}
      style={style}
    >
      {body}
    </m.div>
  );
}
