"use client";

import Link from "next/link";

import { FileIntoProject } from "@/components/prototype/file-into-project";
import { PreviewSurface } from "@/components/ui/preview-surface";
import { useStudio } from "@/lib/data/studio-store";
import { formatUpdated } from "@/lib/format";
import type { Prototype } from "@/lib/registry/types";
import type { ViewMode } from "@/lib/use-view-mode";

/** One prototype, in either view mode. */
export function PrototypeTile({
  prototype,
  mode,
  filing = true,
}: {
  prototype: Prototype;
  mode: ViewMode;
  /** Whether the file-into-project control is offered here. */
  filing?: boolean;
}) {
  const grid = mode === "grid";
  const { projects } = useStudio();
  const project = projects.find((candidate) => candidate.slug === prototype.projectSlug);

  return (
    <article className="group relative">
      {filing ? (
        <div className="absolute right-1.5 top-1.5 z-[var(--z-raised)]">
          <FileIntoProject
            prototypeSlug={prototype.slug}
            teamSlug={prototype.teamSlug}
            currentProjectSlug={prototype.projectSlug}
          />
        </div>
      ) : null}

      <Link
        href={`/prototypes/${prototype.slug}`}
        className={`flex gap-4 ${
          grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
        }`}
      >
        <PreviewSurface
          preview={prototype.preview}
          size={grid ? "md" : "sm"}
          className={grid ? "w-full" : "w-12 shrink-0"}
        />

        <div
          className={`flex min-w-0 gap-1 ${grid ? "flex-col" : "flex-1 flex-col sm:flex-row sm:items-center sm:gap-6"}`}
        >
          <h3
            className={`truncate text-sm font-medium tracking-[var(--tracking-tight)] text-foreground ${grid ? "" : "sm:w-52 sm:text-md"}`}
          >
            {prototype.name}
          </h3>

          <p
            className={`text-xs leading-[var(--leading-normal)] text-foreground-muted ${
              grid ? "line-clamp-2" : "hidden flex-1 truncate text-sm sm:block"
            }`}
          >
            {prototype.description}
          </p>

          <div
            className={`flex items-center gap-2 text-xs text-foreground-subtle ${grid ? "mt-0.5" : "shrink-0"}`}
          >
            <span>{formatUpdated(prototype.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span>
              {prototype.versions.length}{" "}
              {prototype.versions.length === 1 ? "version" : "versions"}
            </span>
            {project ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{project.name}</span>
              </>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
