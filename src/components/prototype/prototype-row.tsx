"use client";

import Link from "next/link";
import { motion as m } from "motion/react";

import { PreviewSurface } from "@/components/ui/preview-surface";
import { layoutId, useMotionLanguage } from "@/lib/motion";
import type { Prototype } from "@/lib/data/types";
import { formatUpdated, statusLabel } from "@/lib/format";

/**
 * A prototype as it appears on the hub.
 *
 * The preview and the title carry shared layout ids, so opening a prototype
 * moves these two objects into the detail view rather than replacing the page.
 */
export function PrototypeRow({ prototype, index }: { prototype: Prototype; index: number }) {
  const motion = useMotionLanguage();

  return (
    <m.article
      layout
      initial={{ opacity: 0, y: motion.distance("md") }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...motion.enter("normal"), delay: index * 0.04 }}
    >
      <Link
        href={`/prototypes/${prototype.slug}`}
        className="group grid grid-cols-1 gap-5 rounded-[var(--r-xl)] p-3 transition-colors duration-[var(--dur-fast)] ease-[var(--curve-standard)] hover:bg-surface-hover sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-7 sm:p-4"
      >
        <PreviewSurface
          preview={prototype.preview}
          layoutId={layoutId.prototypePreview(prototype.slug)}
          className="aspect-[4/3] w-full"
        />

        <div className="flex flex-col justify-center gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-eyebrow">{statusLabel[prototype.status]}</span>
            <span className="text-eyebrow">·</span>
            <span className="text-eyebrow">{formatUpdated(prototype.updatedAt)}</span>
          </div>

          <m.h2
            layoutId={layoutId.prototypeTitle(prototype.slug)}
            transition={motion.enter("spatial")}
            className="font-serif text-xl leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-foreground"
          >
            {prototype.name}
          </m.h2>

          <p className="max-w-[54ch] text-base leading-[var(--leading-relaxed)] text-foreground-muted">
            {prototype.description}
          </p>

          <div className="mt-1 flex items-center gap-2 text-sm text-foreground-subtle">
            <span
              aria-hidden
              className="grid size-6 place-items-center rounded-full bg-surface-inset text-2xs font-medium text-foreground-muted"
            >
              {prototype.owner.initials}
            </span>
            {prototype.owner.name}
          </div>
        </div>
      </Link>
    </m.article>
  );
}
