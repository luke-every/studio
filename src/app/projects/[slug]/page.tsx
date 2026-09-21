"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { motion as m } from "motion/react";

import { PrototypeTile } from "@/components/prototype/prototype-tile";
import { ProjectThumbnail } from "@/components/project/project-thumbnail";
import { Collection } from "@/components/ui/collection";
import { ViewSwitcher } from "@/components/ui/view-switcher";
import { prototypesInProject } from "@/lib/data/projects";
import { useStudio } from "@/lib/data/studio-store";
import { formatUpdated, projectStatusLabel } from "@/lib/format";
import { layoutId, useMotionLanguage } from "@/lib/motion";
import { useViewMode } from "@/lib/use-view-mode";

/**
 * Opening a project.
 *
 * The thumbnail and the name travel here from the card that was clicked, so
 * the project opens rather than the page being replaced. Inside, the same
 * collection and the same view switcher — one browsing model, two levels.
 */
export default function ProjectPage() {
  const params = useParams<{ slug: string }>();
  const { projects, prototypes } = useStudio();
  const [mode, setMode] = useViewMode("prototypes");
  const motion = useMotionLanguage();

  const project = projects.find((candidate) => candidate.slug === params.slug);
  if (!project) notFound();

  const contents = prototypesInProject(project.slug, prototypes);

  return (
    <div className="mx-auto w-full max-w-[var(--bp-xl)] px-5 py-8 sm:px-8 sm:py-10">
      <Link
        href="/"
        className="text-xs text-foreground-subtle transition-colors duration-[var(--dur-fast)] hover:text-foreground"
      >
        ← Projects
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div className="flex min-w-0 items-end gap-4">
          <ProjectThumbnail
            previews={project.previews}
            layoutId={layoutId.projectThumbnail(project.slug)}
            className="aspect-[4/3] w-20 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-eyebrow">{project.client}</p>
            <m.h1
              layoutId={layoutId.projectTitle(project.slug)}
              transition={motion.enter("spatial")}
              className="mt-1.5 text-xl font-medium tracking-[var(--tracking-tight)] text-foreground"
            >
              {project.name}
            </m.h1>
            <p className="mt-2 flex items-center gap-2.5 text-xs text-foreground-subtle">
              <span>{projectStatusLabel[project.status]}</span>
              <span aria-hidden>·</span>
              <span>Led by {project.lead.name}</span>
              <span aria-hidden>·</span>
              <span>{formatUpdated(project.updatedAt)}</span>
            </p>
          </div>
        </div>

        <ViewSwitcher mode={mode} onChange={setMode} scope="prototypes" />
      </header>

      <p className="mt-6 max-w-[62ch] text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
        {project.description}
      </p>

      <div className="mt-10 border-t border-divider pt-7">
        {contents.length > 0 ? (
          <Collection mode={mode}>
            {contents.map((prototype, index) => (
              <PrototypeTile
                key={prototype.slug}
                prototype={prototype}
                mode={mode}
                index={index}
              />
            ))}
          </Collection>
        ) : (
          <div className="max-w-[40ch] py-10">
            <p className="text-md text-foreground">Nothing in here yet.</p>
            <p className="mt-2 text-sm leading-[var(--leading-relaxed)] text-foreground-muted">
              {project.name} is an empty room with a good question in it. The first
              prototype will show up here once there is something to look at.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
