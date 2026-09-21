"use client";

import Link from "next/link";
import { motion as m } from "motion/react";

import { MotionItem } from "@/components/motion";
import { ProjectThumbnail } from "@/components/project/project-thumbnail";
import type { ProjectSummary } from "@/lib/data/projects";
import { layoutId, useMotionLanguage } from "@/lib/motion";
import { formatUpdated, projectStatusLabel } from "@/lib/format";
import type { ViewMode } from "@/lib/use-view-mode";

/**
 * One project, in either view mode.
 *
 * Grid and list are not two components: they are two arrangements of the same
 * objects. Keeping them in one component with shared layout ids is what lets
 * the switch animate the pieces into their new positions instead of swapping
 * one tree for another.
 */
export function ProjectCard({
  project,
  mode,
  index,
}: {
  project: ProjectSummary;
  mode: ViewMode;
  index: number;
}) {
  const motion = useMotionLanguage();
  const grid = mode === "grid";

  return (
    <MotionItem as="article" index={index} rhythm="tight">
      <Link
        href={`/projects/${project.slug}`}
        className={`group flex gap-4 rounded-[var(--r-md)] transition-colors duration-[var(--dur-fast)] ${
          grid ? "flex-col" : "flex-row items-center border-b border-divider py-3"
        }`}
      >
        <ProjectThumbnail
          previews={project.previews}
          layoutId={layoutId.projectThumbnail(project.slug)}
          compact={!grid}
          className={grid ? "aspect-[4/3] w-full" : "aspect-[4/3] w-24 shrink-0"}
        />

        <div
          className={`flex min-w-0 gap-1 ${grid ? "flex-col" : "flex-1 flex-col sm:flex-row sm:items-center sm:gap-6"}`}
        >
          <m.h3
            layoutId={layoutId.projectTitle(project.slug)}
            transition={motion.enter("spatial")}
            className={`truncate text-md font-medium tracking-[var(--tracking-tight)] text-foreground ${grid ? "" : "sm:w-52"}`}
          >
            {project.name}
          </m.h3>

          <p
            className={`text-sm leading-[var(--leading-normal)] text-foreground-muted ${
              grid ? "line-clamp-2" : "hidden flex-1 truncate sm:block"
            }`}
          >
            {project.description}
          </p>

          <div
            className={`flex items-center gap-3 text-xs text-foreground-subtle ${grid ? "mt-1" : "shrink-0"}`}
          >
            <span>
              {project.prototypeCount}{" "}
              {project.prototypeCount === 1 ? "prototype" : "prototypes"}
            </span>
            <span aria-hidden>·</span>
            <span>{formatUpdated(project.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span>{projectStatusLabel[project.status]}</span>
          </div>
        </div>
      </Link>
    </MotionItem>
  );
}
