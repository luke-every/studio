"use client";

import { motion as m } from "motion/react";

import { motionRegister } from "@/lib/motion";
import type { PreviewSource } from "@/lib/data/types";

/**
 * A project has no artwork of its own — it is represented by what is inside
 * it. The newest prototype leads, with the two behind it just visible, so the
 * thumbnail shows depth without becoming a collage.
 */
export function ProjectThumbnail({
  previews,
  layoutId,
  className,
  compact = false,
}: {
  previews: PreviewSource[];
  layoutId?: string;
  className?: string;
  compact?: boolean;
}) {
  const [lead, ...behind] = previews;

  return (
    <m.div
      layoutId={layoutId}
      layout
      transition={motionRegister.spatial}
      className={`relative isolate overflow-hidden rounded-[var(--r-md)] border border-border bg-surface-inset ${className ?? ""}`}
    >
      {lead ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(140deg, ${lead.tint[0]}, ${lead.tint[1]})`,
          }}
        />
      ) : null}

      {!compact
        ? behind.slice(0, 2).map((preview, index) => (
            <div
              key={preview.caption}
              aria-hidden
              className="absolute bottom-0 right-0 rounded-tl-[var(--r-md)] border-l border-t border-[#ffffff]/25"
              style={{
                width: `${28 - index * 8}%`,
                height: `${38 - index * 10}%`,
                transform: `translate(${index * 34}%, ${index * 22}%)`,
                backgroundImage: `linear-gradient(140deg, ${preview.tint[0]}, ${preview.tint[1]})`,
              }}
            />
          ))
        : null}

      {previews.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center text-2xs uppercase tracking-[var(--tracking-caps)] text-foreground-subtle">
          Empty
        </div>
      ) : null}
    </m.div>
  );
}
