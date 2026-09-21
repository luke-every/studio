"use client";

import Link from "next/link";
import { motion as m } from "motion/react";
import { useState } from "react";

import { FocusPlaceholder, MotionFocusLayer } from "@/components/motion";
import { useStudio } from "@/lib/data/studio-store";
import { PreviewSurface } from "@/components/ui/preview-surface";
import { layoutId, useMotionLanguage } from "@/lib/motion";
import type { Exploration, Prototype } from "@/lib/data/types";
import { formatUpdated, statusLabel } from "@/lib/format";

/**
 * The prototype detail view, in its foundation form.
 *
 * What it exists to prove at this stage: the preview and title arrive here as
 * the same objects the hub rendered, and the preview can expand into focus
 * mode from wherever it currently sits — the same object again, in a third
 * context. History, alternative explorations and comparison come later.
 */
export function PrototypeDetail({
  prototype,
  exploration,
}: {
  prototype: Prototype;
  exploration: Exploration;
}) {
  const [focused, setFocused] = useState(false);
  const { projects } = useStudio();
  const motion = useMotionLanguage();
  const current = exploration.versions[0];
  const projectName = projects.find((p) => p.slug === prototype.projectSlug)?.name ?? "Project";

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href={`/projects/${prototype.projectSlug}`}
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← {projectName}
      </Link>

      {/* Identity stays quiet; the prototype itself is the loud part. */}
      <header className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-eyebrow">{statusLabel[prototype.status]}</span>
            <span className="text-eyebrow">·</span>
            <span className="text-eyebrow">{formatUpdated(prototype.updatedAt)}</span>
          </div>

          <m.h1
            layoutId={layoutId.prototypeTitle(prototype.slug)}
            transition={motion.enter("spatial")}
            className="mt-3 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground"
          >
            {prototype.name}
          </m.h1>

          <p className="mt-3 max-w-[58ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            {prototype.description}
          </p>
        </div>

        <div className="max-w-[42ch] border-l border-border pl-4">
          <p className="text-eyebrow">The question</p>
          <p className="mt-1.5 text-md leading-[var(--leading-snug)] text-foreground">
            {prototype.designQuestion}
          </p>
        </div>
      </header>

      {/* The live prototype. In focus mode this exact element travels to the
       * overlay, so the placeholder below holds its place in the layout. */}
      <section className="mt-10">
        <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
          {focused ? (
            <FocusPlaceholder className="size-full" />
          ) : (
            <PreviewSurface
              preview={exploration.preview}
              layoutId={layoutId.prototypePreview(prototype.slug)}
              className="size-full"
            />
          )}

          <div className="absolute right-4 top-4 flex gap-2">
            <button
              type="button"
              onClick={() => setFocused(true)}
              className="rounded-[var(--r-sm)] border border-border bg-surface-elevated/85 px-2.5 py-1 text-xs text-foreground backdrop-blur-md transition-colors duration-[var(--dur-fast)] hover:bg-surface-elevated"
            >
              Focus
            </button>
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          <p className="text-eyebrow">Current exploration</p>
          <h2 className="mt-3 text-md font-medium tracking-[var(--tracking-tight)] text-foreground">
            {exploration.title} · {current.id}
          </h2>
          <p className="mt-3 max-w-[58ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
            {current.summary}
          </p>
          <p className="mt-4 max-w-[58ch] text-sm leading-[var(--leading-relaxed)] text-foreground">
            {current.why}
          </p>
        </div>

        <aside className="text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
          <p className="text-eyebrow">Context</p>
          <p className="mt-3">{prototype.context}</p>
        </aside>
      </section>

      <MotionFocusLayer
        open={focused}
        onClose={() => setFocused(false)}
        label={`${prototype.name} — focus mode`}
      >
        <PreviewSurface
          preview={exploration.preview}
          layoutId={layoutId.prototypePreview(prototype.slug)}
          className="aspect-[16/10] w-full max-w-[var(--bp-lg)]"
        />
      </MotionFocusLayer>

    </div>
  );
}
