"use client";

import Link from "next/link";
import { motion as m } from "motion/react";

import { MotionItem } from "@/components/motion";
import { PreviewSurface } from "@/components/ui/preview-surface";
import { layoutId, useMotionLanguage } from "@/lib/motion";
import { formatUpdated, statusLabel } from "@/lib/format";
import type { Prototype } from "@/lib/data/types";
import type { ViewMode } from "@/lib/use-view-mode";

const statusTone: Record<Prototype["status"], string> = {
  exploring: "bg-foreground-subtle",
  "in-review": "bg-review",
  shipped: "bg-success",
  parked: "bg-border-strong",
};

/** One prototype inside a project, in either view mode. */
export function PrototypeTile({
  prototype,
  mode,
  index,
}: {
  prototype: Prototype;
  mode: ViewMode;
  index: number;
}) {
  const motion = useMotionLanguage();
  const grid = mode === "grid";

  return (
    <MotionItem as="article" index={index} rhythm="tight">
      <Link
        href={`/prototypes/${prototype.slug}`}
        className={`group flex gap-4 rounded-[var(--r-md)] transition-colors duration-[var(--dur-fast)] ${
          grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
        }`}
      >
        <PreviewSurface
          preview={prototype.preview}
          layoutId={layoutId.prototypePreview(prototype.slug)}
          caption={false}
          className={grid ? "aspect-[16/10] w-full" : "aspect-[16/10] w-28 shrink-0"}
        />

        <div
          className={`flex min-w-0 gap-1 ${grid ? "flex-col" : "flex-1 flex-col sm:flex-row sm:items-center sm:gap-6"}`}
        >
          <m.h3
            layoutId={layoutId.prototypeTitle(prototype.slug)}
            transition={motion.enter("spatial")}
            className={`truncate text-md font-medium tracking-[var(--tracking-tight)] text-foreground ${grid ? "" : "sm:w-52"}`}
          >
            {prototype.name}
          </m.h3>

          <p
            className={`text-sm leading-[var(--leading-normal)] text-foreground-muted ${
              grid ? "line-clamp-2" : "hidden flex-1 truncate sm:block"
            }`}
          >
            {prototype.description}
          </p>

          <div
            className={`flex items-center gap-2.5 text-xs text-foreground-subtle ${grid ? "mt-1" : "shrink-0"}`}
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden className={`size-1.5 rounded-full ${statusTone[prototype.status]}`} />
              {statusLabel[prototype.status]}
            </span>
            <span aria-hidden>·</span>
            <span>{formatUpdated(prototype.updatedAt)}</span>
          </div>
        </div>
      </Link>
    </MotionItem>
  );
}
